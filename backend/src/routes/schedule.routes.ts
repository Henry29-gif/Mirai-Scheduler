import { Router } from "express";
import { Response, NextFunction } from "express";
import { AuthRequest, authenticate, requireRole } from "../middleware/auth.middleware";
import { generateMonthlySchedule, publishSchedule } from "../services/autoScheduler.service";
import { prisma } from "../config/prisma";
import { logAudit } from "../services/audit.service";
import { notifyMany } from "../services/notify.service";
import { resolveScopedFacility, assertFacilityInScope } from "../utils/tenant";
import { checkRest, RestResult } from "../utils/rest";

async function generateSchedule(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { month, year, facilityId, startDate, endDate } = req.body as { month: number; year: number; facilityId?: string; startDate?: string; endDate?: string };
    if (!month || !year) return res.status(400).json({ message: "month and year are required" });

    // ADMIN may target any site; everyone else is restricted to their own.
    const targetFacilityId = await resolveScopedFacility(req, facilityId);

    const result = await generateMonthlySchedule(targetFacilityId, Number(month), Number(year), { startDate, endDate });
    await logAudit({
      facilityId: targetFacilityId,
      actorId: req.user!.id,
      action: "SCHEDULE_GENERATED",
      summary: `Generated ${month}/${year} schedule — ${result.shiftsCreated} shifts filled, ${result.openShifts} open`,
      entityType: "SchedulePeriod", entityId: result.schedulePeriodId,
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

// ── GET /api/schedules/cost — labor + overtime cost projection ──────────────
const OT_THRESHOLD = 40;     // hours/week before overtime
const OT_MULTIPLIER = 1.5;
function weekKey(d: Date) {
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const dow = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - dow);
  return day.toISOString().slice(0, 10);
}

async function getCostSummary(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { month, year, facilityId } = req.query as any;
    const targetFacilityId = await resolveScopedFacility(req, facilityId);

    const period = await prisma.schedulePeriod.findUnique({
      where: { facilityId_month_year: { facilityId: targetFacilityId, month: +month, year: +year } },
    });
    if (!period) {
      return res.json({ totalCost: 0, regularCost: 0, overtimeCost: 0, overtimeHours: 0, totalHours: 0, byCert: {}, staffOnOvertime: 0, openShifts: 0 });
    }

    const shifts = await prisma.shift.findMany({
      where: { schedulePeriodId: period.id, status: { in: ["DRAFT", "PUBLISHED"] }, staffId: { not: null } },
      include: { staff: { select: { id: true, hourlyRate: true, certification: true } } },
    });
    const openShifts = await prisma.shift.count({ where: { schedulePeriodId: period.id, status: "OPEN" } });

    // Group hours per staff per week → split regular vs overtime.
    const perStaffWeek = new Map<string, { hours: number; rate: number; cert: string }>();
    for (const s of shifts) {
      if (!s.staff) continue;
      const h = (s.endTime.getTime() - s.startTime.getTime()) / 36e5;
      const key = `${s.staff.id}|${weekKey(s.startTime)}`;
      const cur = perStaffWeek.get(key) || { hours: 0, rate: s.staff.hourlyRate || 0, cert: s.staff.certification || "—" };
      cur.hours += h;
      perStaffWeek.set(key, cur);
    }

    let regularCost = 0, overtimeCost = 0, overtimeHours = 0, totalHours = 0;
    const byCert: Record<string, { hours: number; cost: number }> = {};
    const otStaff = new Set<string>();
    for (const [key, v] of perStaffWeek) {
      const reg = Math.min(v.hours, OT_THRESHOLD);
      const ot = Math.max(0, v.hours - OT_THRESHOLD);
      const rCost = reg * v.rate;
      const oCost = ot * v.rate * OT_MULTIPLIER;
      regularCost += rCost; overtimeCost += oCost; overtimeHours += ot; totalHours += v.hours;
      if (ot > 0) otStaff.add(key.split("|")[0]);
      byCert[v.cert] = byCert[v.cert] || { hours: 0, cost: 0 };
      byCert[v.cert].hours += v.hours;
      byCert[v.cert].cost += rCost + oCost;
    }

    const round = (n: number) => Math.round(n);
    res.json({
      totalHours: round(totalHours),
      regularCost: round(regularCost),
      overtimeCost: round(overtimeCost),
      overtimeHours: round(overtimeHours),
      totalCost: round(regularCost + overtimeCost),
      staffOnOvertime: otStaff.size,
      openShifts,
      byCert: Object.fromEntries(Object.entries(byCert).map(([k, v]) => [k, { hours: round(v.hours), cost: round(v.cost) }])),
    });
  } catch (err) { next(err); }
}

// ── GET /api/schedules/timesheet — payroll-ready export (CSV or JSON) ────────
async function getTimesheet(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { month, year, facilityId, format } = req.query as any;
    const targetFacilityId = await resolveScopedFacility(req, facilityId);

    const period = await prisma.schedulePeriod.findUnique({
      where: { facilityId_month_year: { facilityId: targetFacilityId, month: +month, year: +year } },
    });
    const facility = await prisma.facility.findUnique({ where: { id: targetFacilityId }, select: { name: true } });

    const shifts = period ? await prisma.shift.findMany({
      where: { schedulePeriodId: period.id, status: { in: ["DRAFT", "PUBLISHED"] }, staffId: { not: null } },
      include: { staff: { select: { id: true, firstName: true, lastName: true, certification: true, hourlyRate: true } } },
    }) : [];

    // Aggregate per staff, splitting regular vs overtime per week.
    type Row = { name: string; cert: string; rate: number; reg: number; ot: number };
    const perStaff = new Map<string, Row>();
    const perStaffWeek = new Map<string, number>();
    for (const s of shifts) {
      if (!s.staff) continue;
      const h = (s.endTime.getTime() - s.startTime.getTime()) / 36e5;
      const wk = weekKey(s.startTime);
      const wkKey = `${s.staff.id}|${wk}`;
      const prevWk = perStaffWeek.get(wkKey) || 0;
      const afterWk = prevWk + h;
      // hours in this shift that push the week over 40 are overtime
      const otThis = Math.max(0, afterWk - OT_THRESHOLD) - Math.max(0, prevWk - OT_THRESHOLD);
      const regThis = h - otThis;
      perStaffWeek.set(wkKey, afterWk);

      const row = perStaff.get(s.staff.id) || { name: `${s.staff.firstName} ${s.staff.lastName}`, cert: s.staff.certification || "", rate: s.staff.hourlyRate || 0, reg: 0, ot: 0 };
      row.reg += regThis; row.ot += otThis;
      perStaff.set(s.staff.id, row);
    }

    const rows = [...perStaff.values()].map((r) => {
      const regPay = r.reg * r.rate;
      const otPay = r.ot * r.rate * OT_MULTIPLIER;
      return {
        name: r.name, certification: r.cert, hourlyRate: r.rate,
        regularHours: Math.round(r.reg * 100) / 100,
        overtimeHours: Math.round(r.ot * 100) / 100,
        totalHours: Math.round((r.reg + r.ot) * 100) / 100,
        regularPay: Math.round(regPay * 100) / 100,
        overtimePay: Math.round(otPay * 100) / 100,
        totalPay: Math.round((regPay + otPay) * 100) / 100,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    if (format === "csv") {
      const header = ["Employee", "Certification", "Hourly Rate", "Regular Hours", "Overtime Hours", "Total Hours", "Regular Pay", "Overtime Pay", "Total Pay"];
      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push([`"${r.name}"`, r.certification, r.hourlyRate, r.regularHours, r.overtimeHours, r.totalHours, r.regularPay, r.overtimePay, r.totalPay].join(","));
      }
      const totalPay = rows.reduce((s, r) => s + r.totalPay, 0);
      lines.push(["\"TOTAL\"", "", "", "", "", "", "", "", Math.round(totalPay * 100) / 100].join(","));
      const fname = `timesheet_${(facility?.name || "facility").replace(/\s+/g, "_")}_${year}-${String(month).padStart(2, "0")}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
      return res.send(lines.join("\n"));
    }

    res.json({ facility: facility?.name, month: +month, year: +year, rows });
  } catch (err) { next(err); }
}

async function publishScheduleHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { schedulePeriodId } = req.params;
    const result = await publishSchedule(schedulePeriodId);
    await logAudit({
      facilityId: result.facilityId,
      actorId: req.user!.id,
      action: "SCHEDULE_PUBLISHED",
      summary: `Published the ${result.month}/${result.year} schedule`,
      entityType: "SchedulePeriod", entityId: schedulePeriodId,
    });
    const staff = await prisma.user.findMany({ where: { facilityId: result.facilityId, isActive: true }, select: { id: true } });
    await notifyMany(staff.map((s) => s.id), "Schedule published", `The ${result.month}/${result.year} schedule is now published.`, "info");
    res.json(result);
  } catch (err) { next(err); }
}

async function getScheduleForMonth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { month, year, unitId, facilityId } = req.query as any;

    // ADMIN may view any site; everyone else is restricted to their own.
    const targetFacilityId = await resolveScopedFacility(req, facilityId);

    const period = await prisma.schedulePeriod.findUnique({
      where: { facilityId_month_year: { facilityId: targetFacilityId, month: +month, year: +year } },
    });
    if (!period) return res.status(404).json({ message: "No schedule found for this period" });

    const shifts = await prisma.shift.findMany({
      where: {
        schedulePeriodId: period.id,
        // Staff only see PUBLISHED shifts — DRAFT is the manager's review-before-posting
        // preview. Managers/admins see DRAFT + PUBLISHED + OPEN so the calendar can
        // show unfilled gaps as drop targets (CANCELLED is excluded).
        status: req.user!.role === "STAFF" ? "PUBLISHED" : { in: ["DRAFT", "PUBLISHED", "OPEN"] },
        ...(unitId && { unitId }),
        // Staff can only see their own shifts
        ...(req.user!.role === "STAFF" && { staffId: req.user!.id }),
      },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true, role: true, certification: true } },
        unit:  { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
    });

    res.json({ period, shifts });
  } catch (err) { next(err); }
}

// ── Staffing requirements (how many of each role per shift) ─────────────────
const REQ_SHIFTS = ["Day", "Evening", "Night"];
const REQ_CERTS = ["RN", "LPN", "CCA"];

// GET /api/schedules/requirements?month&year — the saved per-date counts for the
// month. The client fills any missing date/shift/cert with the default of 1.
async function getStaffingRequirements(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const facilityId = await resolveScopedFacility(req, req.query.facilityId as string | undefined);
    const month = Number(req.query.month), year = Number(req.query.year);
    const where: any = { facilityId };
    if (month >= 1 && month <= 12 && year) {
      where.date = { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
    }
    const rows = await prisma.staffingRequirement.findMany({ where });
    const requirements = rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      shift: r.shift,
      certification: r.certification,
      count: r.count,
    }));
    res.json({ facilityId, requirements });
  } catch (err) { next(err); }
}

// PUT /api/schedules/requirements { facilityId?, requirements:[{date,shift,certification,count}] }
async function saveStaffingRequirements(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const facilityId = await resolveScopedFacility(req, req.body?.facilityId as string | undefined);
    const items = Array.isArray(req.body?.requirements) ? req.body.requirements : [];
    const ops = [];
    for (const it of items) {
      const dateStr = String(it?.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
      if (!REQ_SHIFTS.includes(it?.shift) || !REQ_CERTS.includes(it?.certification)) continue;
      const date = new Date(dateStr + "T00:00:00.000Z");
      const count = Math.max(0, Math.min(20, Math.round(Number(it.count) || 0))); // clamp 0–20
      ops.push(prisma.staffingRequirement.upsert({
        where: { facilityId_date_shift_certification: { facilityId, date, shift: it.shift, certification: it.certification } },
        update: { count },
        create: { facilityId, date, shift: it.shift, certification: it.certification, count },
      }));
    }
    if (ops.length) await prisma.$transaction(ops);
    await logAudit({
      facilityId, actorId: req.user!.id, action: "STAFFING_REQUIREMENTS_UPDATED",
      summary: "Updated staffing needs", entityType: "StaffingRequirement",
    });
    res.json({ message: "Staffing needs saved ✓" });
  } catch (err) { next(err); }
}

// ── Review-before-posting: per-staff workload preview ───────────────────────
// GET /api/schedules/workload?month&year&facilityId
// Shows how evenly the draft is distributed: each staffer's shift count, hours,
// and their last (most recent) shift, plus a fairness spread for the admin.
async function getWorkload(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { month, year } = req.query as any;
    const facilityId = await resolveScopedFacility(req, req.query.facilityId as string | undefined);
    const period = await prisma.schedulePeriod.findUnique({
      where: { facilityId_month_year: { facilityId, month: +month, year: +year } },
    });
    if (!period) return res.json({ periodId: null, status: null, staff: [], summary: { min: 0, max: 0, avg: 0, openShifts: 0, totalAssigned: 0 } });

    const [shifts, openShifts, staffList] = await Promise.all([
      prisma.shift.findMany({
        where: { schedulePeriodId: period.id, status: { in: ["DRAFT", "PUBLISHED"] }, staffId: { not: null } },
        select: { staffId: true, startTime: true, endTime: true },
      }),
      prisma.shift.count({ where: { schedulePeriodId: period.id, status: "OPEN" } }),
      prisma.user.findMany({ where: { facilityId, isActive: true, role: "STAFF" }, select: { id: true, firstName: true, lastName: true, certification: true } }),
    ]);

    const agg = new Map<string, { count: number; hours: number; lastStart: Date | null; lastEnd: Date | null }>();
    for (const s of shifts) {
      const a = agg.get(s.staffId!) || { count: 0, hours: 0, lastStart: null, lastEnd: null };
      a.count++;
      a.hours += (s.endTime.getTime() - s.startTime.getTime()) / 36e5;
      if (!a.lastStart || s.startTime > a.lastStart) { a.lastStart = s.startTime; a.lastEnd = s.endTime; }
      agg.set(s.staffId!, a);
    }

    const staff = staffList.map((u) => {
      const a = agg.get(u.id) || { count: 0, hours: 0, lastStart: null, lastEnd: null };
      return {
        userId: u.id, firstName: u.firstName, lastName: u.lastName, certification: u.certification,
        shiftCount: a.count, hours: Math.round(a.hours),
        lastShift: a.lastStart ? { start: a.lastStart, end: a.lastEnd } : null,
      };
    }).sort((x, y) => y.shiftCount - x.shiftCount || x.lastName.localeCompare(y.lastName));

    const counts = staff.filter((s) => s.shiftCount > 0).map((s) => s.shiftCount);
    const summary = {
      min: counts.length ? Math.min(...counts) : 0,
      max: counts.length ? Math.max(...counts) : 0,
      avg: counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0,
      openShifts, totalAssigned: shifts.length,
    };
    res.json({ periodId: period.id, status: period.status, staff, summary });
  } catch (err) { next(err); }
}

// POST /api/schedules/reassign { shiftId, toStaffId }
// The admin's swap tool — move a (draft or published) shift to another eligible
// staffer to balance the load. Enforces certification, facility/tenant, and the
// 8-hour rest rule (so swaps stay compliant).
async function reassignShift(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { shiftId, toStaffId } = (req.body || {}) as { shiftId?: string; toStaffId?: string };
    if (!shiftId || !toStaffId) return res.status(400).json({ message: "shiftId and toStaffId are required" });

    const shift = await prisma.shift.findUnique({ where: { id: shiftId }, include: { unit: { select: { facilityId: true } } } });
    if (!shift) return res.status(404).json({ message: "Shift not found" });
    if (shift.status === "OPEN") return res.status(400).json({ message: "Open shifts are filled from the open board, not reassigned" });
    await assertFacilityInScope(req, shift.unit.facilityId);

    const toStaff = await prisma.user.findUnique({
      where: { id: toStaffId },
      select: { id: true, firstName: true, lastName: true, facilityId: true, certification: true, isActive: true },
    });
    if (!toStaff || !toStaff.isActive || toStaff.facilityId !== shift.unit.facilityId) return res.status(400).json({ message: "That staff member isn't at this facility" });
    if (toStaff.id === shift.staffId) return res.status(400).json({ message: "Already assigned to that person" });
    if (shift.requiredCertification && toStaff.certification !== shift.requiredCertification) return res.status(400).json({ message: `This shift needs a ${shift.requiredCertification}.` });

    // 8h rest / double rule against the target's other shifts.
    const near = await prisma.shift.findMany({
      where: {
        staffId: toStaff.id, id: { not: shift.id }, status: { in: ["DRAFT", "PUBLISHED"] },
        startTime: { lt: new Date(shift.endTime.getTime() + 24 * 36e5) },
        endTime: { gt: new Date(shift.startTime.getTime() - 24 * 36e5) },
      },
      select: { startTime: true, endTime: true },
    });
    if (!checkRest(near, shift.startTime, shift.endTime).ok) return res.status(400).json({ message: `${toStaff.firstName} ${toStaff.lastName} can't take this — it breaks the 8-hour rest / double rule.` });

    await prisma.shift.update({ where: { id: shift.id }, data: { staffId: toStaff.id } });
    await logAudit({
      facilityId: shift.unit.facilityId, actorId: req.user!.id, action: "SHIFT_REASSIGNED",
      summary: `Reassigned a ${shift.requiredCertification ?? ""} shift to ${toStaff.firstName} ${toStaff.lastName}`,
      entityType: "Shift", entityId: shift.id,
    });
    res.json({ message: `Moved to ${toStaff.firstName} ${toStaff.lastName} ✓` });
  } catch (err) { next(err); }
}

// POST /api/schedules/move { sourceShiftId, targetShiftId }
// The calendar's drag-and-drop. `source` is always an assigned shift (the chip
// being dragged). Two outcomes depending on the drop target:
//   • target is OPEN     → MOVE: the dragged staffer fills the open slot, and
//                          their previous slot is left OPEN (a gap to fill next).
//   • target is assigned → SWAP: the two staffers trade shifts.
// Enforces certification match + the 8-hour rest rule + tenant scope (same as the
// reassign tool). A manual move/swap may override a staffer's availability — that
// is only auto-enforced during generation.
async function moveShift(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sourceShiftId, targetShiftId } = (req.body || {}) as { sourceShiftId?: string; targetShiftId?: string };
    if (!sourceShiftId || !targetShiftId) return res.status(400).json({ message: "sourceShiftId and targetShiftId are required" });
    if (sourceShiftId === targetShiftId) return res.status(400).json({ message: "Drop onto a different shift" });

    const staffSel = { select: { id: true, firstName: true, lastName: true, certification: true } };
    const [source, target] = await Promise.all([
      prisma.shift.findUnique({ where: { id: sourceShiftId }, include: { unit: { select: { facilityId: true } }, staff: staffSel } }),
      prisma.shift.findUnique({ where: { id: targetShiftId }, include: { unit: { select: { facilityId: true } }, staff: staffSel } }),
    ]);
    if (!source || !target) return res.status(404).json({ message: "Shift not found" });
    if (!source.staffId || !source.staff) return res.status(400).json({ message: "Drag a shift that has someone assigned" });

    await assertFacilityInScope(req, source.unit.facilityId);
    await assertFacilityInScope(req, target.unit.facilityId);
    if (source.unit.facilityId !== target.unit.facilityId) return res.status(400).json({ message: "Those shifts are at different facilities" });

    // Is `cert` allowed to work a shift that requires `requiredCert`?
    const meets = (cert?: string | null, requiredCert?: string | null) => !requiredCert || cert === requiredCert;
    // 8-hour rest / double-book check for `staffId` taking the [start,end] slot,
    // ignoring the shifts directly involved in this move.
    // Pull a staffer's shifts near a candidate slot (excluding the ones being moved),
    // then apply the shared rest/double rule.
    const restAt = async (staffId: string, start: Date, end: Date, excludeIds: string[]): Promise<RestResult> => {
      const win = 24 * 36e5;
      const near = await prisma.shift.findMany({
        where: {
          staffId, id: { notIn: excludeIds }, status: { in: ["DRAFT", "PUBLISHED"] },
          startTime: { lt: new Date(end.getTime() + win) },
          endTime: { gt: new Date(start.getTime() - win) },
        },
        select: { startTime: true, endTime: true, notes: true },
      });
      return checkRest(near, start, end);
    };
    const full = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`;
    // Friendly "why" for a blocked move — names the existing shift that's in the way.
    const restMsg = (name: string, r: Extract<RestResult, { ok: false }>) => {
      const c = r.conflict;
      const slot = c?.notes ? String(c.notes).split(" · ")[0] : "";
      const day = c ? c.startTime.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
      if (r.reason === "overlap") return `${name} is already working ${day}${slot ? ` (${slot})` : ""} at that time.`;
      if (r.reason === "max-consecutive") return `${name} would be working more than 16 hours straight — a double is fine, but not three shifts in a row.`;
      return `${name} already works ${day}${slot ? ` (${slot})` : ""} — that's inside the 8-hour rest gap, so they can't take this shift too.`;
    };

    if (target.status === "OPEN") {
      // ── MOVE into an open slot; the source slot is left OPEN ────────────────
      if (!meets(source.staff.certification, target.requiredCertification)) {
        return res.status(400).json({ message: `That open shift needs a ${target.requiredCertification}.` });
      }
      const r = await restAt(source.staffId, target.startTime, target.endTime, [source.id, target.id]);
      if (!r.ok) return res.status(400).json({ message: restMsg(full(source.staff), r) });

      await prisma.$transaction([
        prisma.shift.update({ where: { id: target.id }, data: { staffId: source.staffId, status: source.status, openReason: null } }),
        prisma.shift.update({ where: { id: source.id }, data: { staffId: null, status: "OPEN", openReason: "SWAP" } }),
      ]);
      await logAudit({
        facilityId: source.unit.facilityId, actorId: req.user!.id, action: "SHIFT_MOVED",
        summary: `Moved ${full(source.staff)} into an open ${target.requiredCertification ?? ""} shift; their previous slot is now open`,
        entityType: "Shift", entityId: target.id,
      });
      return res.json({ message: `Moved ${full(source.staff)} into the open shift ✓ — their old slot is now open`, kind: "move" });
    }

    // ── SWAP two assigned shifts ──────────────────────────────────────────────
    if (!target.staffId || !target.staff) return res.status(400).json({ message: "Can't swap with that shift" });
    if (target.staffId === source.staffId) return res.status(400).json({ message: "That's already the same person" });
    if (!meets(source.staff.certification, target.requiredCertification)) return res.status(400).json({ message: `${full(source.staff)} isn't a ${target.requiredCertification}.` });
    if (!meets(target.staff.certification, source.requiredCertification)) return res.status(400).json({ message: `${full(target.staff)} isn't a ${source.requiredCertification}.` });

    const [c1, c2] = await Promise.all([
      restAt(source.staffId, target.startTime, target.endTime, [source.id, target.id]),
      restAt(target.staffId, source.startTime, source.endTime, [source.id, target.id]),
    ]);
    if (!c1.ok) return res.status(400).json({ message: restMsg(full(source.staff), c1) });
    if (!c2.ok) return res.status(400).json({ message: restMsg(full(target.staff), c2) });

    const srcStaffId = source.staffId, tgtStaffId = target.staffId;
    await prisma.$transaction([
      prisma.shift.update({ where: { id: source.id }, data: { staffId: tgtStaffId } }),
      prisma.shift.update({ where: { id: target.id }, data: { staffId: srcStaffId } }),
    ]);
    await logAudit({
      facilityId: source.unit.facilityId, actorId: req.user!.id, action: "SHIFT_SWAPPED",
      summary: `Swapped shifts between ${full(source.staff)} and ${full(target.staff)}`,
      entityType: "Shift", entityId: source.id,
    });
    return res.json({ message: `Swapped ${full(source.staff)} ↔ ${full(target.staff)} ✓`, kind: "swap" });
  } catch (err) { next(err); }
}

const router = Router();

router.use(authenticate);

router.get("/",                                               getScheduleForMonth);
router.get("/cost",         requireRole("ADMIN", "MANAGER"), getCostSummary);
router.get("/requirements", requireRole("ADMIN", "MANAGER"), getStaffingRequirements);
router.put("/requirements", requireRole("ADMIN", "MANAGER"), saveStaffingRequirements);
router.get("/workload",     requireRole("ADMIN", "MANAGER"), getWorkload);
router.post("/reassign",    requireRole("ADMIN", "MANAGER"), reassignShift);
router.post("/move",        requireRole("ADMIN", "MANAGER"), moveShift);
router.get("/timesheet",    requireRole("ADMIN"), getTimesheet);
router.post("/generate",    requireRole("ADMIN", "MANAGER"), generateSchedule);
router.patch("/:schedulePeriodId/publish", requireRole("ADMIN", "MANAGER"), publishScheduleHandler);

export default router;

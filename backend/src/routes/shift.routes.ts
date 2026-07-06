import { Router } from "express";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";
import { logAudit, facilityOfShift } from "../services/audit.service";
import { notify, notifySupervisors } from "../services/notify.service";
import { resolveScopedFacility, assertFacilityInScope } from "../utils/tenant";
import { checkRest } from "../utils/rest";

const fmtShift = (s: { startTime: Date; requiredCertification: string | null }) =>
  `${s.requiredCertification || ""} shift on ${new Date(s.startTime).toLocaleString()}`;

const router = Router();
router.use(authenticate);

const MAX_HOURS_PER_WEEK = 40; // overtime-pay threshold — a hint for ranking, not a hard cap
const hours = (start: Date, end: Date) => (end.getTime() - start.getTime()) / 36e5;

function weekBounds(d: Date) {
  // Week = Monday 00:00 → next Monday
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const dow = (day.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(day);
  start.setDate(day.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

// Hours a staff member already has in the week containing `around`.
async function weeklyHours(staffId: string, around: Date) {
  const { start, end } = weekBounds(around);
  const shifts = await prisma.shift.findMany({
    where: { staffId, status: { in: ["DRAFT", "PUBLISHED"] }, startTime: { gte: start, lt: end } },
    select: { startTime: true, endTime: true },
  });
  return shifts.reduce((sum, s) => sum + hours(s.startTime, s.endTime), 0);
}

// Would assigning this shift break the rest / double rule for the staff member?
// (8h rest between blocks; a 16h double is allowed; no triples.)
async function violatesRest(staffId: string, shiftStart: Date, shiftEnd: Date) {
  const win = 24 * 36e5; // wide enough to see a double + 8h rest on either side
  const near = await prisma.shift.findMany({
    where: {
      staffId,
      status: { in: ["DRAFT", "PUBLISHED"] },
      startTime: { lt: new Date(shiftEnd.getTime() + win) },
      endTime: { gt: new Date(shiftStart.getTime() - win) },
    },
    select: { startTime: true, endTime: true },
  });
  return !checkRest(near, shiftStart, shiftEnd).ok;
}

// Ad-hoc shift slots — same clock times the auto-scheduler uses.
const SLOT_START_HOUR: Record<string, number> = { Day: 7, Evening: 15, Night: 23 };
const SLOT_DURATION_H = 8;
const CERTS = ["RN", "LPN", "CCA"];
function slotTimes(dateStr: string, slot: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, SLOT_START_HOUR[slot], 0, 0, 0);
  return { start, end: new Date(start.getTime() + SLOT_DURATION_H * 36e5) };
}
function validSlotInput(date?: string, slot?: string, certification?: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return "date must be YYYY-MM-DD";
  if (!slot || !(slot in SLOT_START_HOUR)) return "slot must be Day, Evening or Night";
  if (!certification || !CERTS.includes(certification)) return "certification must be RN, LPN or CCA";
  return null;
}

// ── GET /api/shifts/slot-candidates — ranked staff for a shift that doesn't
//    exist yet (the calendar's "+ Add shift" panel). Facility-wide, rest-safe,
//    certification-matched; costs are admin-only, same as /:id/candidates. ──
// With `all=1` it returns EVERY shift-capable staffer at the facility (any
// cert): rest-safe people are `eligible`; the rest come back with
// `eligible: false, reason: "rest"` so the UI can show-but-disable them.
router.get("/slot-candidates", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res, next) => {
  try {
    const { date, slot, certification, facilityId, all } = req.query as any;
    const wantAll = all === "1";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    if (!slot || !(slot in SLOT_START_HOUR)) return res.status(400).json({ message: "slot must be Day, Evening or Night" });
    if (!wantAll && (!certification || !CERTS.includes(certification))) return res.status(400).json({ message: "certification must be RN, LPN or CCA" });
    const targetFacilityId = await resolveScopedFacility(req, facilityId);
    const { start, end } = slotTimes(date, slot);

    const users = await prisma.user.findMany({
      where: { facilityId: targetFacilityId, isActive: true, certification: wantAll ? { in: CERTS as any } : certification },
      select: { id: true, firstName: true, lastName: true, certification: true, hourlyRate: true },
    });
    const isAdmin = req.user!.role === "ADMIN";
    const candidates = [];
    for (const u of users) {
      const restBlocked = await violatesRest(u.id, start, end); // hard rule
      if (restBlocked && !wantAll) continue;
      const wkHours = await weeklyHours(u.id, start);
      const wouldBeOvertime = wkHours + SLOT_DURATION_H > MAX_HOURS_PER_WEEK;
      const otCost = Math.round((u.hourlyRate || 0) * SLOT_DURATION_H * (wouldBeOvertime ? 1.5 : 1));
      candidates.push({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        certification: u.certification,
        weeklyHours: Math.round(wkHours),
        wouldBeOvertime,
        eligible: !restBlocked,
        ...(restBlocked ? { reason: "rest" } : {}),
        ...(isAdmin ? { hourlyRate: u.hourlyRate, shiftCost: otCost } : {}),
        _otCost: otCost,
      });
    }
    candidates.sort((x, y) =>
      (x.eligible ? 0 : 1) - (y.eligible ? 0 : 1) ||
      (x.wouldBeOvertime ? 1 : 0) - (y.wouldBeOvertime ? 1 : 0) ||
      x.weeklyHours - y.weeklyHours ||
      x._otCost - y._otCost
    );
    res.json({ candidates: candidates.map(({ _otCost, ...c }) => c) });
  } catch (err) { next(err); }
});

// ── POST /api/shifts — add a single ad-hoc shift (the calendar "+") ─────────
// Body: { date: "YYYY-MM-DD", slot: Day|Evening|Night, certification, staffId?,
// facilityId? }. With staffId the shift is assigned to that person — it goes
// live immediately if the month is already posted, otherwise it joins the
// draft. Without staffId it's posted to the open board.
router.post("/", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res, next) => {
  try {
    const { date, slot, certification, staffId, facilityId } = (req.body || {}) as {
      date?: string; slot?: string; certification?: string; staffId?: string; facilityId?: string;
    };
    const bad = validSlotInput(date, slot, certification);
    if (bad) return res.status(400).json({ message: bad });
    const targetFacilityId = await resolveScopedFacility(req, facilityId);
    const { start, end } = slotTimes(date!, slot!);
    const [year, month] = date!.split("-").map(Number);

    // The month's period — created as a draft if it doesn't exist yet.
    const period = await prisma.schedulePeriod.upsert({
      where: { facilityId_month_year: { facilityId: targetFacilityId, month, year } },
      create: { facilityId: targetFacilityId, month, year, status: "DRAFT" },
      update: {},
    });

    let unitId: string | undefined;
    let staff: { firstName: string; lastName: string } | null = null;
    if (staffId) {
      const u = await prisma.user.findUnique({
        where: { id: staffId },
        select: { id: true, firstName: true, lastName: true, certification: true, facilityId: true, isActive: true },
      });
      if (!u || !u.isActive || u.facilityId !== targetFacilityId) return res.status(400).json({ message: "That staff member isn't at this facility" });
      if (u.certification !== certification) return res.status(400).json({ message: `${u.firstName} ${u.lastName} isn't a ${certification}.` });
      if (await violatesRest(staffId, start, end)) return res.status(400).json({ message: `${u.firstName} ${u.lastName} can't take this — it breaks the 8-hour rest / double rule.` });
      staff = u;
      unitId = (await prisma.unitStaffAssignment.findFirst({ where: { userId: staffId }, select: { unitId: true } }))?.unitId;
    }
    if (!unitId) {
      const unit = await prisma.unit.findFirst({ where: { facilityId: targetFacilityId }, select: { id: true } });
      if (!unit) return res.status(400).json({ message: "This facility has no units yet" });
      unitId = unit.id;
    }

    const status = staffId ? (period.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT") : "OPEN";
    const shift = await prisma.shift.create({
      data: {
        unitId,
        staffId: staffId || null,
        schedulePeriodId: period.id,
        startTime: start,
        endTime: end,
        status,
        ...(staffId ? {} : { openReason: "UNFILLED" }),
        requiredCertification: certification as any,
        notes: `${slot} · ${certification}`, // the calendar buckets by this prefix
      },
    });

    await logAudit({
      facilityId: targetFacilityId,
      actorId: req.user!.id,
      action: "SHIFT_ADDED",
      summary: staff
        ? `Added a ${certification} ${slot} shift on ${date} for ${staff.firstName} ${staff.lastName}`
        : `Added an open ${certification} ${slot} shift on ${date}`,
      entityType: "Shift", entityId: shift.id,
    });
    if (staffId && status === "PUBLISHED") {
      await notify(staffId, "New shift assigned", `You've been added to a ${certification} ${slot} shift on ${start.toLocaleDateString()}.`, "info");
    }

    res.status(201).json({
      message: staff
        ? `Added ${staff.firstName} ${staff.lastName} — ${slot}, ${date} ✓${status === "DRAFT" ? " (in the draft; post the schedule to notify them)" : " — they've been notified"}`
        : `Open ${certification} ${slot} shift posted for ${date} ✓`,
      shift,
    });
  } catch (err) { next(err); }
});

// ── GET /api/shifts/open — open shifts for a facility's month ───────────────
router.get("/open", async (req: AuthRequest, res, next) => {
  try {
    const { month, year, facilityId } = req.query as any;
    const targetFacilityId = await resolveScopedFacility(req, facilityId);

    const period = await prisma.schedulePeriod.findUnique({
      where: { facilityId_month_year: { facilityId: targetFacilityId, month: +month, year: +year } },
    });
    if (!period) return res.json({ openShifts: [] });
    // Staff only see open shifts once the schedule is POSTED — a draft (incl. its
    // unfilled OPEN slots) is the manager's private preview. Managers see them anytime.
    if (req.user!.role === "STAFF" && period.status !== "PUBLISHED") return res.json({ openShifts: [] });

    const openShifts = await prisma.shift.findMany({
      where: { schedulePeriodId: period.id, status: "OPEN" },
      include: { unit: { select: { id: true, name: true } } },
      orderBy: { startTime: "asc" },
    });
    res.json({ openShifts });
  } catch (err) { next(err); }
});

// ── GET /api/shifts/:id/candidates — ranked eligible staff for an open shift ─
router.get("/:id/candidates", async (req: AuthRequest, res, next) => {
  try {
    const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
    if (!shift) return res.status(404).json({ message: "Shift not found" });
    await assertFacilityInScope(req, (await facilityOfShift(shift.id)) || ""); // tenant isolation

    // Staff assigned to this unit with the required certification
    const assignments = await prisma.unitStaffAssignment.findMany({
      where: { unitId: shift.unitId, user: { isActive: true, certification: shift.requiredCertification } },
      include: { user: { select: { id: true, firstName: true, lastName: true, certification: true, hourlyRate: true } } },
    });

    const isAdmin = req.user!.role === "ADMIN";
    const candidates = [];
    for (const a of assignments) {
      if (await violatesRest(a.user.id, shift.startTime, shift.endTime)) continue; // hard rule
      const wkHours = await weeklyHours(a.user.id, shift.startTime);
      const shiftLen = hours(shift.startTime, shift.endTime);
      const wouldBeOvertime = wkHours + shiftLen > MAX_HOURS_PER_WEEK;
      candidates.push({
        id: a.user.id,
        name: `${a.user.firstName} ${a.user.lastName}`,
        certification: a.user.certification,
        weeklyHours: Math.round(wkHours),
        wouldBeOvertime,
        // Pay rate / cost are visible to admins only.
        ...(isAdmin ? {
          hourlyRate: a.user.hourlyRate,
          shiftCost: Math.round((a.user.hourlyRate || 0) * shiftLen * (wouldBeOvertime ? 1.5 : 1)),
        } : {}),
        _otCost: Math.round((a.user.hourlyRate || 0) * shiftLen * (wouldBeOvertime ? 1.5 : 1)),
      });
    }

    // Rank: no-overtime first, then fewest weekly hours, then cheapest.
    candidates.sort((x, y) =>
      (x.wouldBeOvertime ? 1 : 0) - (y.wouldBeOvertime ? 1 : 0) ||
      x.weeklyHours - y.weeklyHours ||
      x._otCost - y._otCost
    );
    res.json({ shift, candidates: candidates.map(({ _otCost, ...c }) => c) }); // _otCost is an internal sort key — never sent
  } catch (err) { next(err); }
});

// Shared assignment logic
async function assignShift(shiftId: string, staffId: string) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) return { error: "Shift not found", code: 404 };
  if (shift.status !== "OPEN") return { error: "This shift is no longer open", code: 409 };

  const user = await prisma.user.findUnique({ where: { id: staffId } });
  if (!user) return { error: "Staff not found", code: 404 };
  if (user.certification !== shift.requiredCertification)
    return { error: `This shift requires a ${shift.requiredCertification}`, code: 400 };
  if (await violatesRest(staffId, shift.startTime, shift.endTime))
    return { error: "Breaks the 8-hour rest rule", code: 400 };

  const updated = await prisma.shift.update({
    where: { id: shiftId },
    data: { staffId, status: "PUBLISHED", openReason: null },
    include: { unit: { select: { name: true } } },
  });
  return { shift: updated };
}

// ── POST /api/shifts/:id/release — call in sick OR drop a shift to the board ─
// reason: "SICK" (call-in) or "SWAP" (voluntary drop). The shift becomes OPEN
// so eligible staff can pick it up — no manager action required.
router.post("/:id/release", async (req: AuthRequest, res, next) => {
  try {
    const { reason } = req.body as { reason?: string };
    const openReason = reason === "SWAP" ? "SWAP" : "SICK";

    const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    // Only the assigned staff member (or a manager/admin) may release it.
    const isOwner = shift.staffId === req.user!.id;
    const isManager = req.user!.role === "ADMIN" || req.user!.role === "MANAGER";
    if (!isOwner && !isManager) return res.status(403).json({ message: "Not your shift" });
    if (isManager && !isOwner) await assertFacilityInScope(req, (await facilityOfShift(shift.id)) || ""); // managers only within their tenant
    if (shift.status === "OPEN") return res.status(409).json({ message: "Shift is already open" });

    const releasedBy = shift.staffId;
    await prisma.shift.update({
      where: { id: shift.id },
      data: { staffId: null, status: "OPEN", openReason },
    });

    // Log a call-in report for sick releases (compliance / escalation tracking).
    if (openReason === "SICK" && releasedBy) {
      await prisma.callInReport.create({
        data: { staffId: releasedBy, shiftId: shift.id, reason: "Called in sick", status: "OPEN" },
      });
    }

    await logAudit({
      facilityId: shift.unitId ? ((await facilityOfShift(shift.id)) || req.user!.facilityId) : req.user!.facilityId,
      actorId: req.user!.id,
      action: openReason === "SICK" ? "CALLED_IN_SICK" : "SHIFT_DROPPED",
      summary: openReason === "SICK"
        ? `Called in sick for a ${fmtShift(shift)}`
        : `Dropped a ${fmtShift(shift)} to the open board`,
      entityType: "Shift", entityId: shift.id,
    });

    // Alert the staff member's supervisors (managers + org admins) so they can
    // arrange cover — appears in their notification bell on web and mobile.
    if (releasedBy) {
      const who = await prisma.user.findUnique({ where: { id: releasedBy }, select: { firstName: true, lastName: true } });
      const name = who ? `${who.firstName} ${who.lastName}` : "A staff member";
      await notifySupervisors(
        releasedBy,
        openReason === "SICK" ? "Staff called in sick" : "Shift dropped to open board",
        openReason === "SICK"
          ? `${name} called in sick for a ${fmtShift(shift)}. It's now open for pickup.`
          : `${name} dropped a ${fmtShift(shift)} to the open board.`,
        openReason === "SICK" ? "warning" : "info",
        [req.user!.id],
      );
    }

    res.json({
      message: openReason === "SICK"
        ? "Called in sick — shift posted for replacement."
        : "Shift dropped — posted to the open board.",
    });
  } catch (err) { next(err); }
});

// ── GET /api/shifts/audit — recent compliance log for a facility ────────────
router.get("/audit", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res, next) => {
  try {
    const { facilityId, limit } = req.query as any;
    const targetFacilityId = await resolveScopedFacility(req, facilityId);
    const entries = await prisma.auditLog.findMany({
      where: { facilityId: targetFacilityId },
      orderBy: { createdAt: "desc" },
      take: Math.min(+limit || 50, 200),
    });
    res.json({ entries });
  } catch (err) { next(err); }
});

// ── POST /api/shifts/:id/accept — staff one-tap accept ──────────────────────
router.post("/:id/accept", async (req: AuthRequest, res, next) => {
  try {
    await assertFacilityInScope(req, (await facilityOfShift(req.params.id)) || ""); // can only accept shifts in your facility
    const result = await assignShift(req.params.id, req.user!.id);
    if (result.error) return res.status(result.code!).json({ message: result.error });
    await logAudit({
      facilityId: req.user!.facilityId,
      actorId: req.user!.id,
      action: "SHIFT_ACCEPTED",
      summary: `Accepted an open ${fmtShift(result.shift!)}`,
      entityType: "Shift", entityId: req.params.id,
    });
    // Let supervisors know an open shift was filled (notification bell, web + mobile).
    const acceptor = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
    await notifySupervisors(
      req.user!.id,
      "Open shift picked up",
      `${acceptor?.firstName} ${acceptor?.lastName} accepted an open ${fmtShift(result.shift!)}.`,
      "success",
      [req.user!.id],
    );
    res.json({ message: "Shift accepted ✓", shift: result.shift });
  } catch (err) { next(err); }
});

// ── POST /api/shifts/:id/assign — manager/admin assigns a candidate ─────────
router.post("/:id/assign", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res, next) => {
  try {
    const { staffId } = req.body;
    if (!staffId) return res.status(400).json({ message: "staffId is required" });
    const shiftFacility = (await facilityOfShift(req.params.id)) || "";
    await assertFacilityInScope(req, shiftFacility); // tenant isolation on the shift
    const assignee = await prisma.user.findUnique({ where: { id: staffId }, select: { facilityId: true } });
    if (!assignee || assignee.facilityId !== shiftFacility) return res.status(400).json({ message: "Staff member isn't at this facility" });
    const result = await assignShift(req.params.id, staffId);
    if (result.error) return res.status(result.code!).json({ message: result.error });
    const target = await prisma.user.findUnique({ where: { id: staffId }, select: { firstName: true, lastName: true } });
    await logAudit({
      facilityId: (await facilityOfShift(req.params.id)) || req.user!.facilityId,
      actorId: req.user!.id,
      action: "SHIFT_ASSIGNED",
      summary: `Assigned ${target?.firstName} ${target?.lastName} to an open ${fmtShift(result.shift!)}`,
      entityType: "Shift", entityId: req.params.id,
    });
    await notify(staffId, "You were assigned a shift", `You've been assigned a ${fmtShift(result.shift!)}.`, "info");
    res.json({ message: "Shift assigned ✓", shift: result.shift });
  } catch (err) { next(err); }
});

export default router;

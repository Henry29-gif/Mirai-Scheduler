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
    candidates.forEach((c) => delete c._otCost); // internal sort key — never sent

    res.json({ shift, candidates });
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

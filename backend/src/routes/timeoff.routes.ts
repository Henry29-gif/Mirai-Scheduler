import { Router } from "express";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";
import { logAudit } from "../services/audit.service";
import { notify, notifySupervisors } from "../services/notify.service";
import { resolveScopedFacility, assertFacilityInScope } from "../utils/tenant";

const router = Router();
router.use(authenticate);

const userSel = { select: { id: true, firstName: true, lastName: true, certification: true } };

// POST /api/timeoff — staff submit a leave request
router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const { startDate, endDate, type, reason } = req.body as any;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate are required" });
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(+start) || isNaN(+end)) return res.status(400).json({ message: "Invalid dates" });
    if (end < start) return res.status(400).json({ message: "End date can't be before start date" });

    const reqRow = await prisma.timeOffRequest.create({
      data: {
        userId: req.user!.id,
        facilityId: req.user!.facilityId,
        type: ["VACATION", "SICK", "PERSONAL", "UNPAID"].includes(type) ? type : "VACATION",
        startDate: start,
        endDate: end,
        reason: reason || null,
        status: "PENDING",
      },
    });
    await logAudit({
      facilityId: req.user!.facilityId, actorId: req.user!.id, action: "TIMEOFF_REQUESTED",
      summary: `Requested ${reqRow.type.toLowerCase()} leave ${start.toLocaleDateString()}–${end.toLocaleDateString()}`,
      entityType: "TimeOffRequest", entityId: reqRow.id,
    });
    // Notify supervisors of the new request so they can review it (bell, web + mobile).
    const requester = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
    await notifySupervisors(
      req.user!.id,
      "Time-off request",
      `${requester?.firstName} ${requester?.lastName} requested ${reqRow.type.toLowerCase()} leave (${start.toLocaleDateString()} – ${end.toLocaleDateString()}).`,
      "info",
      [req.user!.id],
      { kind: "TIMEOFF_REQUEST", id: reqRow.id },
    );
    res.status(201).json({ message: "Time-off request submitted ✓", id: reqRow.id });
  } catch (err) { next(err); }
});

// GET /api/timeoff — staff see their own; managers/admins see the facility's.
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const isManager = req.user!.role === "ADMIN" || req.user!.role === "MANAGER";
    const { facilityId, status } = req.query as any;
    const targetFacility = await resolveScopedFacility(req, facilityId);

    const where: any = isManager
      ? { facilityId: targetFacility, ...(status ? { status } : {}) }
      : { userId: req.user!.id };

    const requests = await prisma.timeOffRequest.findMany({
      where,
      include: { user: userSel },
      orderBy: [{ status: "asc" }, { startDate: "asc" }],
    });
    res.json({ requests });
  } catch (err) { next(err); }
});

// POST /api/timeoff/:id/respond { approve } — manager/admin approves or denies.
router.post("/:id/respond", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res, next) => {
  try {
    const { approve } = req.body as { approve: boolean };
    const reqRow = await prisma.timeOffRequest.findUnique({ where: { id: req.params.id }, include: { user: userSel } });
    if (!reqRow) return res.status(404).json({ message: "Request not found" });
    await assertFacilityInScope(req, reqRow.facilityId); // tenant isolation
    if (reqRow.status !== "PENDING") return res.status(409).json({ message: "Already reviewed" });

    const updated = await prisma.timeOffRequest.update({
      where: { id: reqRow.id },
      data: { status: approve ? "APPROVED" : "DENIED", reviewerId: req.user!.id, reviewedAt: new Date() },
    });
    await logAudit({
      facilityId: reqRow.facilityId, actorId: req.user!.id,
      action: approve ? "TIMEOFF_APPROVED" : "TIMEOFF_DENIED",
      summary: `${approve ? "Approved" : "Denied"} ${reqRow.user.firstName} ${reqRow.user.lastName}'s leave`,
      entityType: "TimeOffRequest", entityId: reqRow.id,
    });
    await notify(
      reqRow.userId,
      approve ? "Time off approved" : "Time off denied",
      `Your ${reqRow.type.toLowerCase()} leave (${reqRow.startDate.toISOString().slice(0, 10)} – ${reqRow.endDate.toISOString().slice(0, 10)}) was ${approve ? "approved" : "denied"}.`,
      approve ? "success" : "warning",
    );
    res.json({ message: approve ? "Leave approved ✓" : "Leave denied", status: updated.status });
  } catch (err) { next(err); }
});

export default router;

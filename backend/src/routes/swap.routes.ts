import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";
import { logAudit, facilityOfShift } from "../services/audit.service";
import { notify } from "../services/notify.service";
import { assertFacilityInScope } from "../utils/tenant";

const router = Router();
router.use(authenticate);

const MIN_REST_HOURS = 8;

// Would assigning [start,end] to staff break the 8h-rest rule, ignoring one shift
// the staff member is giving up in the same trade?
async function restConflict(staffId: string, start: Date, end: Date, excludeShiftId: string) {
  const restMs = MIN_REST_HOURS * 36e5;
  const near = await prisma.shift.findFirst({
    where: {
      staffId,
      id: { not: excludeShiftId },
      status: { in: ["DRAFT", "PUBLISHED"] },
      startTime: { lt: new Date(end.getTime() + restMs) },
      endTime: { gt: new Date(start.getTime() - restMs) },
    },
    select: { id: true },
  });
  return !!near;
}

const shiftSelect = {
  id: true, startTime: true, endTime: true, requiredCertification: true,
  unit: { select: { name: true } },
  staff: { select: { id: true, firstName: true, lastName: true } },
} as const;

// ── GET /api/swaps/coworkers?shiftId= ───────────────────────────────────────
// Coworkers (same unit + same certification) and their upcoming shifts that
// could be traded for MY shift. Returns timings so staff can compare.
router.get("/coworkers", async (req: AuthRequest, res, next) => {
  try {
    const myShift = await prisma.shift.findUnique({
      where: { id: req.query.shiftId as string },
      include: { unit: { select: { name: true } } },
    });
    if (!myShift) return res.status(404).json({ message: "Shift not found" });
    if (myShift.staffId !== req.user!.id) return res.status(403).json({ message: "Not your shift" });

    // Coworkers on the same unit with the same certification (so both can legally cover).
    const coworkers = await prisma.unitStaffAssignment.findMany({
      where: {
        unitId: myShift.unitId,
        userId: { not: req.user!.id },
        user: { isActive: true, certification: myShift.requiredCertification },
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, certification: true } } },
    });

    // Each coworker's upcoming assigned shifts (their offers). Only keep
    // shifts where BOTH sides stay legal after the trade (8-hour rest rule):
    //  - I (requestor) could take their shift, and
    //  - they could take my shift.
    const result = [];
    for (const c of coworkers) {
      const coworkerCanTakeMine = !(await restConflict(c.user.id, myShift.startTime, myShift.endTime, myShift.id));
      if (!coworkerCanTakeMine) continue; // they couldn't legally cover my shift at all

      const candidate = await prisma.shift.findMany({
        where: {
          staffId: c.user.id,
          status: { in: ["DRAFT", "PUBLISHED"] },
          startTime: { gte: new Date(myShift.startTime.getTime() - 31 * 864e5) },
          id: { not: myShift.id },
        },
        select: { id: true, startTime: true, endTime: true, requiredCertification: true, unit: { select: { name: true } } },
        orderBy: { startTime: "asc" },
        take: 20,
      });

      const shifts = [];
      for (const s of candidate) {
        if (!(await restConflict(req.user!.id, s.startTime, s.endTime, myShift.id))) shifts.push(s);
        if (shifts.length >= 6) break;
      }
      if (shifts.length) result.push({ id: c.user.id, name: `${c.user.firstName} ${c.user.lastName}`, certification: c.user.certification, shifts });
    }

    res.json({
      myShift: { id: myShift.id, startTime: myShift.startTime, endTime: myShift.endTime, unit: myShift.unit?.name, requiredCertification: myShift.requiredCertification },
      coworkers: result,
    });
  } catch (err) { next(err); }
});

// ── POST /api/swaps  { originalShiftId, offeredShiftId, message? } ───────────
// Propose trading MY shift (original) for a coworker's shift (offered).
router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const { originalShiftId, offeredShiftId, message } = req.body as any;
    const [original, offered] = await Promise.all([
      prisma.shift.findUnique({ where: { id: originalShiftId } }),
      prisma.shift.findUnique({ where: { id: offeredShiftId } }),
    ]);
    if (!original || !offered) return res.status(404).json({ message: "Shift not found" });
    if (original.staffId !== req.user!.id) return res.status(403).json({ message: "You can only trade your own shift" });
    await assertFacilityInScope(req, (await facilityOfShift(offeredShiftId)) || ""); // offered shift must be in your facility
    if (!offered.staffId) return res.status(400).json({ message: "That shift is unassigned — pick it up from the open board instead" });
    if (offered.requiredCertification !== original.requiredCertification)
      return res.status(400).json({ message: "Can only trade between the same certification" });

    const existing = await prisma.swapRequest.findFirst({
      where: { originalShiftId, offeredShiftId, status: "PENDING" },
    });
    if (existing) return res.status(409).json({ message: "A pending trade already exists for these shifts" });

    const swap = await prisma.swapRequest.create({
      data: {
        requestorId: req.user!.id,
        targetId: offered.staffId,
        originalShiftId,
        offeredShiftId,
        message: message || null,
        status: "PENDING",
      },
    });
    await logAudit({
      facilityId: req.user!.facilityId, actorId: req.user!.id, action: "SWAP_REQUESTED",
      summary: `Proposed a shift trade`, entityType: "SwapRequest", entityId: swap.id,
    });
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
    await notify(offered.staffId, "New shift trade request", `${me?.firstName} ${me?.lastName} wants to trade shifts with you.`, "info");
    res.status(201).json({ message: "Trade request sent ✓", swapId: swap.id });
  } catch (err) { next(err); }
});

// ── GET /api/swaps — my incoming + outgoing trades (with both timings) ───────
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const [incoming, outgoing] = await Promise.all([
      prisma.swapRequest.findMany({
        where: { targetId: req.user!.id, status: "PENDING" },
        include: { originalShift: { select: shiftSelect }, offeredShift: { select: shiftSelect }, requestor: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.swapRequest.findMany({
        where: { requestorId: req.user!.id },
        include: { originalShift: { select: shiftSelect }, offeredShift: { select: shiftSelect }, target: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    res.json({ incoming, outgoing });
  } catch (err) { next(err); }
});

// ── POST /api/swaps/:id/respond  { accept: bool } ───────────────────────────
// The target accepts (executes the trade) or rejects.
router.post("/:id/respond", async (req: AuthRequest, res, next) => {
  try {
    const { accept } = req.body as { accept: boolean };
    const swap = await prisma.swapRequest.findUnique({
      where: { id: req.params.id },
      include: { originalShift: true, offeredShift: true },
    });
    if (!swap) return res.status(404).json({ message: "Trade not found" });
    if (swap.targetId !== req.user!.id) return res.status(403).json({ message: "Not your trade to answer" });
    if (swap.status !== "PENDING") return res.status(409).json({ message: "This trade was already resolved" });

    if (!accept) {
      await prisma.swapRequest.update({ where: { id: swap.id }, data: { status: "REJECTED", resolvedAt: new Date() } });
      await notify(swap.requestorId, "Trade declined", "Your shift trade request was declined.", "warning");
      return res.json({ message: "Trade declined." });
    }

    const orig = swap.originalShift; // requestor's shift → goes to target (me)
    const off = swap.offeredShift;   // my shift → goes to requestor
    if (!orig.staffId || !off.staffId) return res.status(409).json({ message: "One of the shifts is no longer assigned" });

    // Rest checks: each person taking the other's shift (ignoring the one they give up).
    if (await restConflict(swap.targetId, orig.startTime, orig.endTime, off.id))
      return res.status(400).json({ message: "Taking that shift would break your 8-hour rest rule" });
    if (await restConflict(swap.requestorId, off.startTime, off.endTime, orig.id))
      return res.status(400).json({ message: "The other nurse can't take your shift (8-hour rest rule)" });

    // Execute the trade atomically.
    await prisma.$transaction([
      prisma.shift.update({ where: { id: orig.id }, data: { staffId: swap.targetId } }),
      prisma.shift.update({ where: { id: off.id }, data: { staffId: swap.requestorId } }),
      prisma.swapRequest.update({ where: { id: swap.id }, data: { status: "COMPLETED", resolvedAt: new Date() } }),
    ]);
    await logAudit({
      facilityId: req.user!.facilityId, actorId: req.user!.id, action: "SWAP_COMPLETED",
      summary: `Completed a shift trade`, entityType: "SwapRequest", entityId: swap.id,
    });
    await notify(swap.requestorId, "Trade accepted", "Your shift trade was accepted — your schedule has been updated.", "success");
    res.json({ message: "Shifts traded ✓" });
  } catch (err) { next(err); }
});

export default router;

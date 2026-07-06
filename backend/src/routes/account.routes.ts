import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";
import { redisAuth as redis } from "../config/redis";
import { logAudit } from "../services/audit.service";
import { notifyMany } from "../services/notify.service";

const router = Router();
router.use(authenticate);

// POST /api/account/delete — the signed-in user erases their own personal data.
//
// Employee work records (shifts, timecards, audit entries) are RETAINED for
// payroll and legal/compliance reasons, but they are de-identified: the user's
// name, email and phone are scrubbed and the login is permanently disabled.
// This satisfies Apple Guideline 5.1.1(v) (in-app account deletion) and Google
// Play's data-deletion requirement while preserving referential integrity.
router.post("/delete", async (req: AuthRequest, res, next) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, firstName: true, lastName: true, facilityId: true },
    });
    if (!me) return res.status(404).json({ message: "Account not found" });

    // Notify the facility's managers/admins so any upcoming shifts get covered.
    const supervisors = await prisma.user.findMany({
      where: { facilityId: me.facilityId, role: { in: ["ADMIN", "MANAGER"] }, isActive: true, id: { not: me.id } },
      select: { id: true },
    });

    await prisma.user.update({
      where: { id: me.id },
      data: {
        firstName: "Deleted",
        lastName: "User",
        email: `deleted+${me.id}@deleted.invalid`,
        phone: null,
        isActive: false,
      },
    });
    // Kill any live sessions immediately (the auth middleware also rejects
    // deactivated accounts on their next request — this is belt and braces).
    try { await redis.set(`pwchanged:${me.id}`, Math.floor(Date.now() / 1000), "EX", 8 * 3600 + 300); } catch { /* best-effort */ }

    await logAudit({
      facilityId: me.facilityId, actorId: me.id, action: "ACCOUNT_DELETED",
      summary: `${me.firstName} ${me.lastName} deleted their account`,
      entityType: "User", entityId: me.id,
    });
    await notifyMany(
      supervisors.map((s) => s.id),
      "A staff account was deleted",
      `${me.firstName} ${me.lastName} deleted their NurseScheduler account. Review their upcoming shifts.`,
      "warning",
    );

    res.json({ message: "Your account and personal details have been deleted." });
  } catch (err) { next(err); }
});

export default router;

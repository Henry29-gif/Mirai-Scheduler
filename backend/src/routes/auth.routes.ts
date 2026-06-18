import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendPasswordResetEmail } from "../services/email.service";
import { logAudit } from "../services/audit.service";

const router = Router();

const RESET_TTL_SECONDS = 60 * 60; // reset links valid for 1 hour
const APP_WEB_URL = (process.env.APP_WEB_URL || "http://localhost:5173").replace(/\/$/, "");
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const resetKey = (tokenHash: string) => `pwreset:${tokenHash}`;

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (!user.isActive) return res.status(403).json({ message: "Account deactivated" });

    const token = jwt.sign(
      { sub: user.id, role: user.role, facilityId: user.facilityId, organizationId: user.organizationId },
      process.env.JWT_SECRET!,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role, facilityId: user.facilityId, organizationId: user.organizationId },
    });
  } catch (err) { next(err); }
});

// POST /api/auth/forgot-password { email }
// Always responds the same way (never reveals whether an account exists). If the
// email belongs to an active user, a single-use reset token (stored hashed in
// Redis with a 1-hour TTL) is generated and emailed as a link.
router.post("/forgot-password", async (req, res, next) => {
  try {
    const email = String((req.body?.email ?? "")).trim().toLowerCase();
    const generic = { message: "If an account exists for that email, a reset link is on its way." };
    if (!email) return res.json(generic);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return res.json(generic); // don't leak existence

    const rawToken = crypto.randomBytes(32).toString("hex");
    await redis.set(resetKey(sha256(rawToken)), user.id, "EX", RESET_TTL_SECONDS);
    const resetUrl = `${APP_WEB_URL}/?reset=${rawToken}`;

    try { await sendPasswordResetEmail(user.email, resetUrl); }
    catch (e) { /* logged in the email service; still respond generically */ }

    // In non-production, return the link so the flow is testable without email set up.
    const devResetUrl = process.env.NODE_ENV !== "production" ? resetUrl : undefined;
    res.json({ ...generic, ...(devResetUrl ? { devResetUrl } : {}) });
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password { token, password }
// Validates the single-use token, sets the new password, burns the token, and
// invalidates existing refresh-token sessions.
router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = (req.body ?? {}) as { token?: string; password?: string };
    if (!token || !password) return res.status(400).json({ message: "Token and new password are required" });
    if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

    const key = resetKey(sha256(token));
    const userId = await redis.get(key);
    if (!userId) return res.status(400).json({ message: "This reset link is invalid or has expired. Request a new one." });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      await redis.del(key);
      return res.status(400).json({ message: "This reset link is no longer valid." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }), // sign out other sessions
    ]);
    await redis.del(key); // single use

    await logAudit({
      facilityId: user.facilityId, actorId: user.id, action: "PASSWORD_RESET",
      summary: `${user.firstName} ${user.lastName} reset their password`,
      entityType: "User", entityId: user.id,
    });

    res.json({ message: "Your password has been reset. You can now sign in." });
  } catch (err) { next(err); }
});

export default router;

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { redisAuth } from "../config/redis";

export interface AuthRequest extends Request {
  user?: { id: string; role: string; facilityId: string; organizationId: string };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token provided" });

  let payload: any;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  // Revocation: a password reset (or account deletion) stamps pwchanged:<id>
  // in Redis; any token issued BEFORE that moment is rejected even though JWTs
  // are otherwise stateless. Fail-open if Redis blips — the isActive check
  // below still runs, and the stamp outlives the longest possible token (8h).
  try {
    const changedAt = await redisAuth.get(`pwchanged:${payload.sub}`);
    if (changedAt && payload.iat < Number(changedAt)) {
      return res.status(401).json({ message: "Session expired — please sign in again" });
    }
  } catch { /* Redis briefly unavailable — continue */ }

  // Deactivated/deleted accounts lose access on their next request, not when
  // their token happens to expire. DB errors surface as 500s (next(err)), NOT
  // 401s, so a flaky DB can't force clients to log out.
  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { isActive: true } });
    if (!user || !user.isActive) return res.status(401).json({ message: "Account is no longer active" });
  } catch (err) {
    return next(err);
  }

  req.user = { id: payload.sub, role: payload.role, facilityId: payload.facilityId, organizationId: payload.organizationId };
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

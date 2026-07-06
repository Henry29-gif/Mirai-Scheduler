/**
 * SOCKET.IO — Real-time events
 *
 * Events emitted by server:
 *   schedule:updated   { schedulePeriodId, facilityId }
 *   swap:new           { swapRequestId, toUserId }
 *   swap:resolved      { swapRequestId, status }
 *   callIn:alert       { callInReportId, unitId, shiftId }
 *   notification:new   { notification }
 *
 * Rooms:
 *   facility:{id}   — all staff in the facility
 *   user:{id}       — individual user
 */
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger";
import { prisma } from "../config/prisma";
import { redisAuth } from "../config/redis";
import { allowedOrigins } from "../utils/origins";

let io: Server;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    // Same allowlist as the Express API — never "*", even when the env var is unset.
    cors: { origin: allowedOrigins(), credentials: true },
  });

  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));
    let payload: any;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!);
    } catch {
      return next(new Error("Invalid token"));
    }
    // Mirror the HTTP middleware's revocation checks (password reset stamp +
    // deactivated account) so sockets can't outlive a killed session.
    try {
      const changedAt = await redisAuth.get(`pwchanged:${payload.sub}`);
      if (changedAt && payload.iat < Number(changedAt)) return next(new Error("Session expired"));
    } catch { /* Redis blip — isActive check below still applies */ }
    try {
      const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { isActive: true } });
      if (!user || !user.isActive) return next(new Error("Unauthorized"));
    } catch { /* DB blip — deny rather than allow */ return next(new Error("Unauthorized")); }
    (socket as any).user = payload;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const user = (socket as any).user;
    logger.info(`Socket connected: user=${user.sub} role=${user.role}`);

    // Join facility room + personal room
    socket.join(`facility:${user.facilityId}`);
    socket.join(`user:${user.sub}`);

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: user=${user.sub}`);
    });
  });

  logger.info("Socket.io initialized");
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

// ── Emit helpers ─────────────────────────────────────────────────────────────

export function emitToFacility(facilityId: string, event: string, data: unknown) {
  getIO().to(`facility:${facilityId}`).emit(event, data);
}

export function emitToUser(userId: string, event: string, data: unknown) {
  getIO().to(`user:${userId}`).emit(event, data);
}

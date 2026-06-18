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

let io: Server;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.ALLOWED_ORIGINS?.split(",") || "*", credentials: true },
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
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

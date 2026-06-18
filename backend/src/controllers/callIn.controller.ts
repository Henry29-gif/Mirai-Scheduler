import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";
import { callInQueue } from "../jobs/queues";

export async function reportCallIn(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { shiftId, reason } = req.body;
    if (!shiftId) return res.status(400).json({ message: "shiftId is required" });

    // Verify the shift belongs to this staff member
    const shift = await prisma.shift.findFirst({
      where: { id: shiftId, staffId: req.user!.id, status: "PUBLISHED" },
    });
    if (!shift) return res.status(404).json({ message: "Shift not found or not assigned to you" });

    const report = await prisma.callInReport.create({
      data: { staffId: req.user!.id, shiftId, reason },
    });

    // Queue the SMS alert job (non-blocking)
    await callInQueue.add("send-call-in-alert", { callInReportId: report.id }, { attempts: 3 });

    res.status(201).json({ message: "Call-in recorded. Your manager has been notified.", reportId: report.id });
  } catch (err) { next(err); }
}

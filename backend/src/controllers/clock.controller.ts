import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth.middleware';

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/**
 * POST /api/clock/:shiftId/in
 * Clock in for a shift. Records GPS coordinates for verification.
 * A staff member can only clock in within 30 minutes of shift start.
 */
export const clockIn = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { latitude, longitude } = locationSchema.parse(req.body);

    const shift = await prisma.shift.findFirst({
      where: {
        id: req.params.shiftId,
        assignedToId: req.user!.id,
        status: 'SCHEDULED',
      },
    });

    if (!shift) throw new AppError('Shift not found or not assigned to you.', 404);

    // Check within 30-minute clock-in window
    const now = new Date();
    const windowStart = new Date(shift.startTime.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(shift.startTime.getTime() + 60 * 60 * 1000); // 1hr grace period

    if (now < windowStart) {
      throw new AppError('Too early to clock in. Clock-in opens 30 minutes before shift start.', 400);
    }
    if (now > windowEnd) {
      throw new AppError('Clock-in window has passed for this shift.', 400);
    }

    // Check not already clocked in
    const existing = await prisma.clockIn.findUnique({ where: { shiftId: shift.id } });
    if (existing?.clockInAt) {
      throw new AppError('Already clocked in for this shift.', 409);
    }

    const clockInRecord = existing
      ? await prisma.clockIn.update({
          where: { shiftId: shift.id },
          data: { clockInAt: now, clockInLat: latitude, clockInLng: longitude },
        })
      : await prisma.clockIn.create({
          data: {
            shiftId: shift.id,
            userId: req.user!.id,
            clockInAt: now,
            clockInLat: latitude,
            clockInLng: longitude,
          },
        });

    res.json({ success: true, data: clockInRecord });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/clock/:shiftId/out
 * Clock out of a shift. Computes actual hours worked.
 */
export const clockOut = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { latitude, longitude, notes } = z.object({
      ...locationSchema.shape,
      notes: z.string().max(500).optional(),
    }).parse(req.body);

    const clockInRecord = await prisma.clockIn.findFirst({
      where: {
        shiftId: req.params.shiftId,
        userId: req.user!.id,
        clockInAt: { not: null },
        clockOutAt: null,
      },
    });

    if (!clockInRecord) {
      throw new AppError('No active clock-in found for this shift.', 404);
    }

    const now = new Date();
    const actualHours =
      (now.getTime() - clockInRecord.clockInAt!.getTime()) / (1000 * 60 * 60);

    const updated = await prisma.$transaction([
      prisma.clockIn.update({
        where: { id: clockInRecord.id },
        data: {
          clockOutAt: now,
          clockOutLat: latitude,
          clockOutLng: longitude,
          actualHours: Math.round(actualHours * 100) / 100,
          notes,
        },
      }),
      prisma.shift.update({
        where: { id: req.params.shiftId },
        data: { status: 'COMPLETED' },
      }),
    ]);

    res.json({ success: true, data: updated[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/clock/status/:shiftId
 * Get clock-in status for a shift
 */
export const getClockStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const record = await prisma.clockIn.findFirst({
      where: {
        shiftId: req.params.shiftId,
        userId: req.user!.id,
      },
    });

    res.json({
      success: true,
      data: {
        isClockedIn: !!record?.clockInAt && !record?.clockOutAt,
        isClockedOut: !!record?.clockOutAt,
        clockInAt: record?.clockInAt,
        clockOutAt: record?.clockOutAt,
        actualHours: record?.actualHours,
      },
    });
  } catch (err) {
    next(err);
  }
};

import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { ShiftType, ShiftStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendCallInAlert } from '../services/sms.service';
import { sendNotification, sendBulkNotification } from '../services/notification.service';

const shiftQuerySchema = z.object({
  unitId: z.string().cuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  userId: z.string().cuid().optional(),
  isPublished: z.string().transform(v => v === 'true').optional(),
  status: z.nativeEnum(ShiftStatus).optional(),
});

const createShiftSchema = z.object({
  unitId: z.string().cuid(),
  assignedToId: z.string().cuid().optional(),
  date: z.string(),
  shiftType: z.nativeEnum(ShiftType),
  notes: z.string().optional(),
});

/**
 * GET /api/shifts
 * Returns shifts filtered by date range, unit, user, or status.
 * Staff can only see their own shifts; managers see all.
 */
export const getShifts = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = shiftQuerySchema.parse(req.query);
    const { user } = req;

    // Staff can only query their own shifts
    const effectiveUserId =
      user?.role === 'STAFF' ? user.id : query.userId;

    const where: Record<string, unknown> = {
      unit: { facilityId: user!.facilityId },
    };

    if (effectiveUserId) where.assignedToId = effectiveUserId;
    if (query.unitId) where.unitId = query.unitId;
    if (query.status) where.status = query.status;
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;

    if (query.startDate || query.endDate) {
      where.date = {
        ...(query.startDate && { gte: new Date(query.startDate) }),
        ...(query.endDate && { lte: new Date(query.endDate) }),
      };
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, position: true },
        },
        unit: { select: { id: true, name: true } },
        clockIn: { select: { clockInAt: true, clockOutAt: true, actualHours: true } },
        swapRequest: { select: { id: true, status: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    res.json({ success: true, data: shifts });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/shifts/:id
 */
export const getShiftById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shift = await prisma.shift.findFirst({
      where: {
        id: req.params.id,
        unit: { facilityId: req.user!.facilityId },
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, phone: true, position: true } },
        unit: { select: { id: true, name: true } },
        clockIn: true,
        callIn: true,
        swapRequest: true,
      },
    });

    if (!shift) throw new AppError('Shift not found.', 404);

    // Staff can only view their own shifts
    if (req.user?.role === 'STAFF' && shift.assignedToId !== req.user.id) {
      throw new AppError('Access denied.', 403);
    }

    res.json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/shifts
 * Create a single shift (managers/admins only)
 */
export const createShift = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createShiftSchema.parse(req.body);

    const unit = await prisma.unit.findFirst({
      where: { id: data.unitId, facilityId: req.user!.facilityId },
    });
    if (!unit) throw new AppError('Unit not found.', 404);

    // Calculate times based on shift type
    const SHIFT_HOURS: Record<ShiftType, { start: number; duration: number }> = {
      DAY:     { start: 7,  duration: 8 },
      EVENING: { start: 15, duration: 8 },
      NIGHT:   { start: 23, duration: 8 },
    };

    const { start, duration } = SHIFT_HOURS[data.shiftType];
    const date = new Date(data.date);
    const startTime = new Date(date);
    startTime.setHours(start, 0, 0, 0);
    const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);

    const shift = await prisma.shift.create({
      data: {
        unitId: data.unitId,
        assignedToId: data.assignedToId ?? null,
        date,
        startTime,
        endTime,
        shiftType: data.shiftType,
        hoursCount: duration,
        status: data.assignedToId ? 'SCHEDULED' : 'OPEN',
        notes: data.notes,
        isPublished: false,
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        unit: { select: { name: true } },
      },
    });

    // Notify assigned staff
    if (shift.assignedToId) {
      await sendNotification({
        userId: shift.assignedToId,
        type: 'SHIFT_ASSIGNED',
        title: '📋 New Shift Assigned',
        body: `You have been assigned a ${data.shiftType} shift in ${shift.unit.name} on ${date.toLocaleDateString()}.`,
        data: { shiftId: shift.id },
      });
    }

    res.status(201).json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/shifts/:id/call-in
 * Staff member reports they cannot make their shift.
 * Triggers SMS to all managers in the facility.
 */
export const callInForShift = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { reason, note } = z.object({
      reason: z.enum(['SICK', 'FAMILY_EMERGENCY', 'PERSONAL', 'OTHER']),
      note: z.string().max(500).optional(),
    }).parse(req.body);

    const shift = await prisma.shift.findFirst({
      where: {
        id: req.params.id,
        assignedToId: req.user!.id,
        unit: { facilityId: req.user!.facilityId },
        status: 'SCHEDULED',
      },
      include: {
        assignedTo: { select: { firstName: true, lastName: true } },
        unit: { select: { name: true } },
      },
    });

    if (!shift) {
      throw new AppError('Shift not found or not assigned to you.', 404);
    }

    // Can't call in for a shift that already started
    if (shift.startTime < new Date()) {
      throw new AppError('Cannot call in for a shift that has already started.', 400);
    }

    // Update shift status and create call-in record in a transaction
    const [updatedShift, callIn] = await prisma.$transaction([
      prisma.shift.update({
        where: { id: shift.id },
        data: { status: 'CALLED_IN' },
      }),
      prisma.callIn.create({
        data: {
          shiftId: shift.id,
          userId: req.user!.id,
          reason,
          note,
        },
      }),
    ]);

    // Send SMS alerts to all managers
    const staffName = `${shift.assignedTo!.firstName} ${shift.assignedTo!.lastName}`;
    const sentTo = await sendCallInAlert(req.user!.facilityId, {
      staffName,
      shiftDate: shift.date,
      shiftType: shift.shiftType,
      unitName: shift.unit.name,
      reason,
      note,
    });

    // Update call-in with SMS recipients
    await prisma.callIn.update({
      where: { id: callIn.id },
      data: { smsSentAt: new Date(), smsRecipients: sentTo },
    });

    // Notify all unit staff about the open shift opportunity
    const unitStaff = await prisma.userUnit.findMany({
      where: { unitId: shift.unitId },
      select: { userId: true },
    });
    const staffIds = unitStaff.map(u => u.userId).filter(id => id !== req.user!.id);

    if (staffIds.length > 0) {
      await sendBulkNotification(
        staffIds,
        'OPEN_SHIFT_AVAILABLE',
        '🔔 Open Shift Available',
        `A ${shift.shiftType} shift in ${shift.unit.name} on ${shift.date.toLocaleDateString()} needs coverage.`,
        { shiftId: shift.id }
      );
    }

    res.json({
      success: true,
      data: { shift: updatedShift, smsSentTo: sentTo.length },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/shifts/:id/assign
 * Assign/reassign a shift (manager only)
 */
export const assignShift = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = z.object({ userId: z.string().cuid().nullable() }).parse(req.body);

    const shift = await prisma.shift.findFirst({
      where: { id: req.params.id, unit: { facilityId: req.user!.facilityId } },
      include: { unit: { select: { name: true } } },
    });

    if (!shift) throw new AppError('Shift not found.', 404);

    const updated = await prisma.shift.update({
      where: { id: shift.id },
      data: {
        assignedToId: userId,
        status: userId ? 'SCHEDULED' : 'OPEN',
      },
    });

    if (userId) {
      await sendNotification({
        userId,
        type: 'SHIFT_ASSIGNED',
        title: '📋 Shift Assigned',
        body: `You have been assigned a ${shift.shiftType} shift in ${shift.unit.name} on ${shift.date.toLocaleDateString()}.`,
        data: { shiftId: shift.id },
      });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

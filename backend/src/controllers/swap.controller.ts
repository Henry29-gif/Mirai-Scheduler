import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendNotification } from '../services/notification.service';

const createSwapSchema = z.object({
  originalShiftId: z.string().cuid(),
  targetId: z.string().cuid().optional(),
  offeredShiftId: z.string().cuid().optional(),
  requesterNote: z.string().max(500).optional(),
});

/**
 * POST /api/swaps
 * Request a shift swap. Staff can request to swap with a specific colleague
 * or post an open swap request for anyone to pick up.
 */
export const requestSwap = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createSwapSchema.parse(req.body);

    // Verify the requester owns the original shift
    const originalShift = await prisma.shift.findFirst({
      where: {
        id: data.originalShiftId,
        assignedToId: req.user!.id,
        unit: { facilityId: req.user!.facilityId },
        status: 'SCHEDULED',
      },
      include: { unit: { select: { name: true } } },
    });

    if (!originalShift) {
      throw new AppError('Shift not found or not assigned to you.', 404);
    }

    // Can't swap a shift that already started
    if (originalShift.startTime < new Date()) {
      throw new AppError('Cannot swap a shift that has already started.', 400);
    }

    // Check no existing pending swap for this shift
    const existingSwap = await prisma.shiftSwap.findFirst({
      where: { originalShiftId: data.originalShiftId, status: { in: ['PENDING', 'ACCEPTED'] } },
    });
    if (existingSwap) {
      throw new AppError('A pending swap request already exists for this shift.', 409);
    }

    const swap = await prisma.shiftSwap.create({
      data: {
        originalShiftId: data.originalShiftId,
        requesterId: req.user!.id,
        targetId: data.targetId,
        offeredShiftId: data.offeredShiftId,
        requesterNote: data.requesterNote,
        status: 'PENDING',
      },
      include: {
        requester: { select: { firstName: true, lastName: true } },
        originalShift: { include: { unit: { select: { name: true } } } },
      },
    });

    // Notify the target staff member (if specified)
    if (data.targetId) {
      await sendNotification({
        userId: data.targetId,
        type: 'SWAP_REQUEST',
        title: '🔄 Shift Swap Request',
        body: `${swap.requester.firstName} ${swap.requester.lastName} wants to swap their ${originalShift.shiftType} shift in ${originalShift.unit.name}.`,
        data: { swapId: swap.id },
      });
    }

    res.status(201).json({ success: true, data: swap });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/swaps/:id/respond
 * Target staff member accepts or rejects a swap request directed at them.
 */
export const respondToSwap = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { action } = z.object({
      action: z.enum(['ACCEPT', 'REJECT']),
    }).parse(req.body);

    const swap = await prisma.shiftSwap.findFirst({
      where: {
        id: req.params.id,
        targetId: req.user!.id,
        status: 'PENDING',
      },
      include: {
        originalShift: { include: { unit: { facilityId: true, name: true } } },
        requester: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!swap) throw new AppError('Swap request not found.', 404);

    // Verify facility match
    if (swap.originalShift.unit.facilityId !== req.user!.facilityId) {
      throw new AppError('Access denied.', 403);
    }

    if (action === 'REJECT') {
      await prisma.shiftSwap.update({
        where: { id: swap.id },
        data: { status: 'REJECTED' },
      });
      await sendNotification({
        userId: swap.requesterId,
        type: 'SWAP_REJECTED',
        title: '❌ Swap Request Declined',
        body: `Your swap request for the ${swap.originalShift.shiftType} shift was declined.`,
        data: { swapId: swap.id },
      });
      res.json({ success: true, data: { status: 'REJECTED' } });
      return;
    }

    // Accepted — check if manager approval needed
    const facility = await prisma.facility.findUnique({
      where: { id: req.user!.facilityId },
      select: { swapRequiresApproval: true },
    });

    if (!facility?.swapRequiresApproval) {
      // Auto-approve: execute the swap immediately
      await executeSwap(swap.id, swap.originalShiftId, swap.targetId!, swap.offeredShiftId);
      await sendNotification({
        userId: swap.requesterId,
        type: 'SWAP_APPROVED',
        title: '✅ Swap Approved',
        body: `Your shift swap has been completed.`,
        data: { swapId: swap.id },
      });
      res.json({ success: true, data: { status: 'APPROVED' } });
    } else {
      // Mark as accepted, await manager review
      await prisma.shiftSwap.update({
        where: { id: swap.id },
        data: { status: 'ACCEPTED' },
      });
      // Notify managers
      const managers = await prisma.user.findMany({
        where: { facilityId: req.user!.facilityId, role: { in: ['ADMIN', 'MANAGER'] } },
        select: { id: true },
      });
      for (const manager of managers) {
        await sendNotification({
          userId: manager.id,
          type: 'SWAP_REQUEST',
          title: '⏳ Swap Awaiting Approval',
          body: `A shift swap in ${swap.originalShift.unit.name} requires your approval.`,
          data: { swapId: swap.id },
        });
      }
      res.json({ success: true, data: { status: 'ACCEPTED', awaitingApproval: true } });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/swaps/:id/review
 * Manager approves or rejects an accepted swap.
 */
export const reviewSwap = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { action, managerNote } = z.object({
      action: z.enum(['APPROVE', 'REJECT']),
      managerNote: z.string().optional(),
    }).parse(req.body);

    const swap = await prisma.shiftSwap.findFirst({
      where: {
        id: req.params.id,
        status: 'ACCEPTED',
        originalShift: { unit: { facilityId: req.user!.facilityId } },
      },
      include: {
        originalShift: { include: { unit: { select: { name: true } } } },
      },
    });

    if (!swap) throw new AppError('Swap request not found.', 404);

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    await prisma.shiftSwap.update({
      where: { id: swap.id },
      data: {
        status: newStatus,
        managerNote,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
    });

    if (action === 'APPROVE' && swap.targetId) {
      await executeSwap(swap.id, swap.originalShiftId, swap.targetId, swap.offeredShiftId ?? undefined);
    }

    // Notify both parties
    const notifType = action === 'APPROVE' ? 'SWAP_APPROVED' : 'SWAP_REJECTED';
    const message = action === 'APPROVE'
      ? 'Your shift swap has been approved and completed.'
      : `Your shift swap was rejected. ${managerNote ? `Reason: ${managerNote}` : ''}`;

    await sendNotification({
      userId: swap.requesterId,
      type: notifType,
      title: action === 'APPROVE' ? '✅ Swap Approved' : '❌ Swap Rejected',
      body: message,
      data: { swapId: swap.id },
    });

    if (swap.targetId) {
      await sendNotification({
        userId: swap.targetId,
        type: notifType,
        title: action === 'APPROVE' ? '✅ Swap Approved' : '❌ Swap Rejected',
        body: message,
        data: { swapId: swap.id },
      });
    }

    res.json({ success: true, data: { status: newStatus } });
  } catch (err) {
    next(err);
  }
};

/**
 * Executes the actual shift reassignment when a swap is approved.
 * Wrapped in a transaction to prevent partial updates.
 */
async function executeSwap(
  swapId: string,
  originalShiftId: string,
  targetUserId: string,
  offeredShiftId?: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Get original shift's current owner
    const originalShift = await tx.shift.findUnique({
      where: { id: originalShiftId },
      select: { assignedToId: true },
    });

    // Reassign original shift to target
    await tx.shift.update({
      where: { id: originalShiftId },
      data: { assignedToId: targetUserId, status: 'SWAPPED' },
    });

    // If bidirectional swap, reassign the offered shift
    if (offeredShiftId && originalShift?.assignedToId) {
      await tx.shift.update({
        where: { id: offeredShiftId },
        data: { assignedToId: originalShift.assignedToId, status: 'SWAPPED' },
      });
    }

    await tx.shiftSwap.update({
      where: { id: swapId },
      data: { status: 'APPROVED' },
    });
  });
}

/**
 * GET /api/swaps
 * List swaps relevant to the current user.
 */
export const getSwaps = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const isManager = req.user?.role !== 'STAFF';
    const where = isManager
      ? { originalShift: { unit: { facilityId: req.user!.facilityId } } }
      : {
          OR: [
            { requesterId: req.user!.id },
            { targetId: req.user!.id },
          ],
        };

    const swaps = await prisma.shiftSwap.findMany({
      where,
      include: {
        originalShift: {
          include: { unit: { select: { name: true } } },
        },
        requester: { select: { id: true, firstName: true, lastName: true } },
        target: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: swaps });
  } catch (err) {
    next(err);
  }
};

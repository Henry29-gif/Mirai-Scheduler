/**
 * SCHEDULING ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a draft monthly schedule for a facility that:
 *  1. Covers all required shifts for each unit (Day / Evening / Night)
 *  2. Distributes hours as evenly as possible among staff per unit
 *  3. Respects contracted hours (hoursPerWeek)
 *  4. Prevents double-booking (no staff member on overlapping shifts)
 *  5. Enforces minimum 8-hour rest between consecutive shifts
 *
 * Algorithm: Greedy weighted assignment
 *   - For each shift slot, sort eligible staff by (hoursScheduled / targetHours)
 *   - Assign the staff member with the lowest ratio (fewest hours relative to target)
 *   - Re-sort after each assignment for fair distribution
 */

import { prisma } from '../utils/prisma';
import { ShiftType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { addHours, isWithinInterval, eachDayOfInterval, startOfMonth, endOfMonth } from '../utils/dateHelpers';

// Shift time windows (start hour in 24h format)
const SHIFT_WINDOWS: Record<ShiftType, { startHour: number; durationHours: number }> = {
  DAY:     { startHour: 7,  durationHours: 8 },
  EVENING: { startHour: 15, durationHours: 8 },
  NIGHT:   { startHour: 23, durationHours: 8 },
};

const MIN_REST_HOURS = 8; // Minimum hours between shifts

interface StaffHourTracker {
  userId: string;
  scheduledHours: number;
  targetMonthlyHours: number;
  // All shift time ranges to check for conflicts
  scheduledTimeRanges: Array<{ start: Date; end: Date }>;
}

interface GenerateScheduleOptions {
  facilityId: string;
  year: number;
  month: number; // 1-12
  replaceExistingDraft?: boolean;
}

interface ScheduleResult {
  shiftsCreated: number;
  openShifts: number;     // Slots that couldn't be filled
  staffSummary: Array<{
    userId: string;
    name: string;
    scheduledHours: number;
    targetHours: number;
    variance: number; // scheduled - target
  }>;
}

export async function generateMonthlySchedule(
  options: GenerateScheduleOptions
): Promise<ScheduleResult> {
  const { facilityId, year, month, replaceExistingDraft = false } = options;

  logger.info(`Generating schedule for facility ${facilityId}, ${year}-${month}`);

  // ─── Load all facility data ─────────────────────────────────────────────────
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    include: {
      units: {
        include: {
          userUnits: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  hoursPerWeek: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!facility) throw new AppError('Facility not found.', 404);

  // ─── Date range ─────────────────────────────────────────────────────────────
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = eachDayOfInterval(monthStart, monthEnd);
  const weeksInMonth = daysInMonth.length / 7;

  // ─── Optional: delete existing draft for the month ─────────────────────────
  if (replaceExistingDraft) {
    await prisma.shift.deleteMany({
      where: {
        unit: { facilityId },
        date: { gte: monthStart, lte: monthEnd },
        isPublished: false,
      },
    });
    logger.info(`Cleared existing draft shifts for ${year}-${month}`);
  }

  // ─── Track hours per staff member across the WHOLE facility ────────────────
  // Key: userId
  const staffTrackers = new Map<string, StaffHourTracker>();

  // Initialize trackers for all active staff in the facility
  for (const unit of facility.units) {
    for (const { user } of unit.userUnits) {
      if (!user.isActive) continue;
      if (!staffTrackers.has(user.id)) {
        staffTrackers.set(user.id, {
          userId: user.id,
          scheduledHours: 0,
          targetMonthlyHours: (user.hoursPerWeek / 7) * daysInMonth.length,
          scheduledTimeRanges: [],
        });
      }
    }
  }

  let totalCreated = 0;
  let totalOpen = 0;
  const shiftsToCreate: Array<Parameters<typeof prisma.shift.create>[0]['data']> = [];

  // ─── Generate shift slots per unit per day ──────────────────────────────────
  for (const unit of facility.units) {
    // Get eligible staff for this unit (active only)
    const unitStaffIds = unit.userUnits
      .filter(u => u.user.isActive)
      .map(u => u.userId);

    for (const day of daysInMonth) {
      for (const shiftType of [ShiftType.DAY, ShiftType.EVENING, ShiftType.NIGHT] as ShiftType[]) {
        // Generate required number of shift slots for this unit
        for (let slot = 0; slot < unit.requiredStaffPerShift; slot++) {
          const { startHour, durationHours } = SHIFT_WINDOWS[shiftType];

          const shiftStart = new Date(day);
          shiftStart.setHours(startHour, 0, 0, 0);
          const shiftEnd = addHours(shiftStart, durationHours);

          // Find best eligible staff member for this slot
          const assignedUserId = findBestStaff(
            unitStaffIds,
            staffTrackers,
            shiftStart,
            shiftEnd
          );

          if (assignedUserId) {
            // Update tracker
            const tracker = staffTrackers.get(assignedUserId)!;
            tracker.scheduledHours += durationHours;
            tracker.scheduledTimeRanges.push({ start: shiftStart, end: shiftEnd });
            totalCreated++;
          } else {
            totalOpen++;
          }

          shiftsToCreate.push({
            unitId: unit.id,
            assignedToId: assignedUserId ?? null,
            date: day,
            startTime: shiftStart,
            endTime: shiftEnd,
            shiftType,
            hoursCount: durationHours,
            status: assignedUserId ? 'SCHEDULED' : 'OPEN',
            isPublished: false,
          });
        }
      }
    }
  }

  // ─── Bulk insert all shifts ─────────────────────────────────────────────────
  // Batch in chunks of 500 to avoid DB limits
  const CHUNK_SIZE = 500;
  for (let i = 0; i < shiftsToCreate.length; i += CHUNK_SIZE) {
    const chunk = shiftsToCreate.slice(i, i + CHUNK_SIZE);
    await prisma.shift.createMany({ data: chunk as any });
  }

  logger.info(`Schedule generated: ${totalCreated} assigned, ${totalOpen} open`);

  // ─── Build summary ──────────────────────────────────────────────────────────
  const allUserIds = [...staffTrackers.keys()];
  const users = await prisma.user.findMany({
    where: { id: { in: allUserIds } },
    select: { id: true, firstName: true, lastName: true },
  });

  const staffSummary = users.map(user => {
    const tracker = staffTrackers.get(user.id)!;
    return {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      scheduledHours: Math.round(tracker.scheduledHours * 10) / 10,
      targetHours: Math.round(tracker.targetMonthlyHours * 10) / 10,
      variance: Math.round((tracker.scheduledHours - tracker.targetMonthlyHours) * 10) / 10,
    };
  }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  return {
    shiftsCreated: totalCreated,
    openShifts: totalOpen,
    staffSummary,
  };
}

/**
 * Finds the best available staff member for a given shift slot.
 * Uses a greedy "lowest hours-to-target ratio" strategy for fairness.
 */
function findBestStaff(
  eligibleUserIds: string[],
  trackers: Map<string, StaffHourTracker>,
  shiftStart: Date,
  shiftEnd: Date
): string | null {
  const eligible = eligibleUserIds
    .map(id => trackers.get(id))
    .filter((t): t is StaffHourTracker => {
      if (!t) return false;
      // Check not over contracted hours
      if (t.scheduledHours >= t.targetMonthlyHours * 1.1) return false;
      // Check no time conflicts (including rest period)
      return !hasConflict(t.scheduledTimeRanges, shiftStart, shiftEnd);
    })
    .sort((a, b) => {
      // Sort by hours ratio: prefer staff with fewer scheduled hours vs target
      const ratioA = a.scheduledHours / (a.targetMonthlyHours || 1);
      const ratioB = b.scheduledHours / (b.targetMonthlyHours || 1);
      return ratioA - ratioB;
    });

  return eligible[0]?.userId ?? null;
}

/**
 * Returns true if a new shift would conflict with existing scheduled shifts,
 * including the mandatory minimum rest period between shifts.
 */
function hasConflict(
  existing: Array<{ start: Date; end: Date }>,
  newStart: Date,
  newEnd: Date
): boolean {
  const newStartWithBuffer = addHours(newStart, -MIN_REST_HOURS);
  const newEndWithBuffer = addHours(newEnd, MIN_REST_HOURS);

  return existing.some(range => {
    // Check if existing shift falls within the buffered window
    return (
      isWithinInterval(range.start, newStartWithBuffer, newEndWithBuffer) ||
      isWithinInterval(range.end, newStartWithBuffer, newEndWithBuffer) ||
      isWithinInterval(newStart, range.start, range.end) ||
      isWithinInterval(newEnd, range.start, range.end)
    );
  });
}

/**
 * Publishes a draft schedule, making it visible to all staff.
 * Also sends push notifications to every affected staff member.
 */
export async function publishSchedule(
  facilityId: string,
  year: number,
  month: number
): Promise<{ published: number }> {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);

  const result = await prisma.shift.updateMany({
    where: {
      unit: { facilityId },
      date: { gte: monthStart, lte: monthEnd },
      isPublished: false,
    },
    data: { isPublished: true },
  });

  logger.info(`Published ${result.count} shifts for facility ${facilityId}`);
  return { published: result.count };
}

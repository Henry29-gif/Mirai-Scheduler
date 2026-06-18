/**
 * CRON SERVICE
 * Scheduled background jobs using node-cron.
 *
 * Jobs:
 *  - Daily 6 AM: Send shift reminders for today's shifts
 *  - Monthly 1st at 1 AM: Auto-generate next month's draft schedule
 *  - Hourly: Clean up expired refresh tokens
 */

import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendNotification } from './notification.service';
import { generateMonthlySchedule } from './scheduling.service';
import { logger } from '../utils/logger';
import { addHours } from '../utils/dateHelpers';

// ─── Shift Reminders ─────────────────────────────────────────────────────────
// Every day at 6:00 AM - remind staff of their shifts today
cron.schedule('0 6 * * *', async () => {
  logger.info('[CRON] Running daily shift reminder job');
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const todayShifts = await prisma.shift.findMany({
      where: {
        date: { gte: todayStart, lte: todayEnd },
        assignedToId: { not: null },
        isPublished: true,
        status: 'SCHEDULED',
      },
      include: {
        assignedTo: { select: { id: true, firstName: true } },
        unit: { select: { name: true } },
      },
    });

    for (const shift of todayShifts) {
      if (!shift.assignedTo) continue;
      const startTime = shift.startTime.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });
      await sendNotification({
        userId: shift.assignedTo.id,
        type: 'SHIFT_REMINDER',
        title: '⏰ Shift Reminder',
        body: `You have a ${shift.shiftType} shift in ${shift.unit.name} starting at ${startTime} today.`,
        data: { shiftId: shift.id },
      });
    }

    logger.info(`[CRON] Sent ${todayShifts.length} shift reminders`);
  } catch (err) {
    logger.error('[CRON] Shift reminder job failed:', err);
  }
});

// ─── Auto-Generate Next Month's Draft ────────────────────────────────────────
// 1st of each month at 1:00 AM
cron.schedule('0 1 1 * *', async () => {
  logger.info('[CRON] Auto-generating next month draft schedules');
  try {
    const now = new Date();
    const nextMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
    const nextYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

    const facilities = await prisma.facility.findMany({
      select: { id: true, name: true },
    });

    for (const facility of facilities) {
      try {
        const result = await generateMonthlySchedule({
          facilityId: facility.id,
          year: nextYear,
          month: nextMonth,
          replaceExistingDraft: false, // Don't overwrite manually edited drafts
        });
        logger.info(
          `[CRON] Generated draft for ${facility.name}: ` +
          `${result.shiftsCreated} shifts, ${result.openShifts} open`
        );
      } catch (err) {
        logger.error(`[CRON] Failed to generate draft for facility ${facility.id}:`, err);
      }
    }
  } catch (err) {
    logger.error('[CRON] Auto-schedule generation failed:', err);
  }
});

// ─── Token Cleanup ────────────────────────────────────────────────────────────
// Every hour
cron.schedule('0 * * * *', async () => {
  try {
    const deleted = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (deleted.count > 0) {
      logger.info(`[CRON] Cleaned up ${deleted.count} expired refresh tokens`);
    }
  } catch (err) {
    logger.error('[CRON] Token cleanup failed:', err);
  }
});

logger.info('📅 Cron jobs initialized');

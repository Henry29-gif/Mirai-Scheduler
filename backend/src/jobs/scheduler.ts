/** Set up recurring jobs (e.g. auto-generate next month's schedule on the 20th) */
import { scheduleQueue } from "./queues";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";

export async function scheduleRecurringJobs() {
  // Run daily at midnight to check if a new schedule should be queued
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  const triggerMonthlyGeneration = async () => {
    const now = new Date();
    // On the 20th of each month, auto-generate next month's schedule for all facilities
    if (now.getDate() === 20) {
      const nextMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
      const nextYear  = now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear();
      const facilities = await prisma.facility.findMany({ select: { id: true } });
      for (const f of facilities) {
        await scheduleQueue.add(
          "generate-monthly",
          { facilityId: f.id, month: nextMonth, year: nextYear },
          { jobId: `auto-gen-${f.id}-${nextYear}-${nextMonth}`, attempts: 2 }
        );
      }
      logger.info(`Queued schedule generation for ${facilities.length} facilities`);
    }
  };

  await triggerMonthlyGeneration();
  setInterval(triggerMonthlyGeneration, TWENTY_FOUR_HOURS);
}

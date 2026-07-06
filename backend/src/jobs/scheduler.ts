/** Set up recurring jobs (e.g. auto-generate next month's schedule on the 20th) */
import { scheduleQueue } from "./queues";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { sweepCertExpiry } from "../services/certAlerts.service";

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

  // Guarded so a failure here (e.g. Redis briefly down) can't prevent the
  // cert-expiry sweep below from being scheduled.
  try { await triggerMonthlyGeneration(); } catch (err) { logger.error("Monthly generation check failed", err); }
  setInterval(triggerMonthlyGeneration, TWENTY_FOUR_HOURS);

  // Daily certification-expiry sweep (30-day / 7-day / expired alerts to the
  // staff member + their supervisors). Also runs once at startup.
  const runCertSweep = async () => {
    try {
      const r = await sweepCertExpiry();
      if (r.alerts > 0) logger.info(`[CertAlerts] Sent ${r.alerts} expiry alert(s) across ${r.checked} certification(s)`);
    } catch (err) {
      logger.error("[CertAlerts] Sweep failed", err);
    }
  };
  await runCertSweep();
  setInterval(runCertSweep, TWENTY_FOUR_HOURS);
}

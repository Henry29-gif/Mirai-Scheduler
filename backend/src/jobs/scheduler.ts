/** Recurring background jobs (run in-process; started once from index.ts) */
import { logger } from "../utils/logger";
import { sweepCertExpiry } from "../services/certAlerts.service";

export async function scheduleRecurringJobs() {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

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

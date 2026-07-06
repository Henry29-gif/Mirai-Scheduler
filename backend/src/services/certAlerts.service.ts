import { prisma } from "../config/prisma";
import { notify, notifySupervisors } from "./notify.service";
import { logger } from "../utils/logger";

/**
 * CERTIFICATION EXPIRY ALERTS
 * Daily sweep over staff certifications that have an expiry date. When one
 * crosses a threshold (30 days out, 7 days out, expired) it notifies the
 * staff member AND their supervisors (facility managers + org admins) via the
 * in-app bell on web and mobile.
 *
 * `alertStage` on the cert remembers the last alert sent (0=none, 1=30-day,
 * 2=7-day, 3=expired) so the daily run never repeats a warning. When the
 * expiry date changes (renewal), the PATCH route resets alertStage to 0 and
 * the sweep treats the new date fresh: renewed clear of all windows → silent;
 * renewed to a date still inside a window → a new alert for that stage fires,
 * so tight renewal periods are never silently skipped.
 */
const stageOf = (daysLeft: number) => (daysLeft < 0 ? 3 : daysLeft <= 7 ? 2 : daysLeft <= 30 ? 1 : 0);

export async function sweepCertExpiry(): Promise<{ checked: number; alerts: number }> {
  const certs = await prisma.staffCertification.findMany({
    where: { expiryDate: { not: null }, user: { isActive: true } },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });

  const now = new Date();
  // "Today" as the server's LOCAL calendar date. The stored expiry is a
  // date-only value encoded at UTC midnight, so we compare calendar dates —
  // using UTC clock fields here would skew a day ahead in the evening.
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  let alerts = 0;

  for (const cert of certs) {
    // Each cert is isolated: one bad row (e.g. deleted mid-sweep) must never
    // abort the alerts for everyone after it in the list.
    try {
      const exp = cert.expiryDate!;
      const expUTC = Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate());
      const daysLeft = Math.round((expUTC - todayUTC) / 86400000);
      const stage = stageOf(daysLeft);

      if (stage === cert.alertStage) continue;
      if (stage === 0) {
        // Renewed clear of every alert window — re-arm silently.
        await prisma.staffCertification.updateMany({ where: { id: cert.id }, data: { alertStage: 0 } });
        continue;
      }
      // The stage changed and the cert IS inside an alert window: either it
      // crossed a new threshold (stage > alertStage) or a renewal landed
      // inside a window (stage < alertStage). Both deserve a fresh alert —
      // silently skipping the latter would hide exactly the tight renewals
      // supervisors most need to hear about.

      const dateStr = exp.toISOString().slice(0, 10);
      const expired = stage === 3;
      const when = expired
        ? `expired on ${dateStr}`
        : daysLeft === 0
          ? `expires today (${dateStr})`
          : `expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${dateStr})`;

      await notify(
        cert.userId,
        expired ? "Certification expired" : "Certification expiring soon",
        `Your ${cert.name} ${when}. Renew it and update it in My Space → Certification.`,
        "warning",
      );
      await notifySupervisors(
        cert.userId,
        expired ? "Staff certification expired" : "Staff certification expiring",
        `${cert.user.firstName} ${cert.user.lastName}'s ${cert.name} ${when}.`,
        "warning",
      );
      // updateMany: a no-op (not a throw) if the cert was deleted meanwhile.
      await prisma.staffCertification.updateMany({ where: { id: cert.id }, data: { alertStage: stage } });
      alerts++;
    } catch (err) {
      logger.error(`[CertAlerts] Failed processing certification ${cert.id}`, err);
    }
  }

  return { checked: certs.length, alerts };
}

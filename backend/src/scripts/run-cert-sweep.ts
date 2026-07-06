/**
 * Manually run the certification-expiry sweep (it also runs automatically on
 * server start and every 24h).   npx tsx src/scripts/run-cert-sweep.ts
 */
import { prisma } from "../config/prisma";
import { sweepCertExpiry } from "../services/certAlerts.service";

sweepCertExpiry()
  .then((r) => console.log(`Checked ${r.checked} certification(s) with expiry dates — sent ${r.alerts} alert(s).`))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

/**
 * Demo data: realistic clock-in/out history for PAST published shifts, so the
 * "My Staff" metrics (attendance, punctuality, reliability) show varied values.
 *   npx tsx src/scripts/seed-clockins.ts
 */
import { prisma } from "../config/prisma";

async function main() {
  const now = Date.now();
  const shifts = await prisma.shift.findMany({
    where: { status: "PUBLISHED", staffId: { not: null }, startTime: { lt: new Date(now) } },
    select: { id: true, staffId: true, startTime: true, endTime: true, unit: { select: { facilityId: true } } },
  });
  const staffIds = [...new Set(shifts.map((s) => s.staffId!))];
  if (!staffIds.length) { console.log("No past published shifts — generate & post a schedule first."); return; }

  // Replace any existing clock data for these staff so the script is idempotent.
  await prisma.clockInEvent.deleteMany({ where: { userId: { in: staffIds } } });

  // Each staffer gets a stable reliability profile from their id.
  const profile = (id: string) => {
    const h = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
    if (h % 7 === 0) return { attend: 0.6, onTime: 0.5 };   // unreliable
    if (h % 3 === 0) return { attend: 0.82, onTime: 0.7 };  // medium
    return { attend: 0.96, onTime: 0.92 };                  // reliable
  };

  const events: any[] = [];
  for (const s of shifts) {
    const p = profile(s.staffId!);
    if (Math.random() > p.attend) continue; // didn't show / no clock record
    const lateMin = Math.random() < p.onTime ? Math.random() * 6 - 3 : 8 + Math.random() * 20;
    events.push({ userId: s.staffId!, facilityId: s.unit.facilityId, shiftId: s.id, event: "CLOCK_IN", timestamp: new Date(s.startTime.getTime() + lateMin * 60000) });
    events.push({ userId: s.staffId!, facilityId: s.unit.facilityId, shiftId: s.id, event: "CLOCK_OUT", timestamp: new Date(s.endTime.getTime() + (Math.random() * 10 - 2) * 60000) });
  }
  await prisma.clockInEvent.createMany({ data: events });
  console.log(`Seeded ${events.length} clock events for ${staffIds.length} staff across ${shifts.length} past shifts.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

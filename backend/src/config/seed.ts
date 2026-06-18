import { PrismaClient, Role, Certification } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Hourly pay rates by certification (used for overtime-cost ranking).
const RATE: Record<Certification, number> = {
  RN: 46,
  LPN: 32,
  CCA: 24,
};

const FIRST = ["Nora","Liam","Maya","Owen","Aria","Ethan","Zoe","Noah","Ivy","Leo","Ruby","Kai","Elena","Sam","Tara","Jude","Mia","Cole","Lena","Raj"];
const LAST  = ["Patel","Carter","Nguyen","Lopez","Khan","Reed","Cole","Hayes","Frost","Ortiz","Brooks","Singh","Walsh","Diaz","Park"];

let nameSeed = 0;
function nextName() {
  const f = FIRST[nameSeed % FIRST.length];
  const l = LAST[(nameSeed * 3 + 1) % LAST.length];
  nameSeed++;
  return { firstName: f, lastName: l };
}

async function getOrCreateFacility(name: string, organizationId: string) {
  let f = await prisma.facility.findFirst({ where: { name } });
  if (!f) f = await prisma.facility.create({ data: { name, timezone: "America/Halifax", organizationId } });
  return f;
}
async function getOrCreateUnit(name: string, facilityId: string) {
  let u = await prisma.unit.findFirst({ where: { name, facilityId } });
  if (!u) u = await prisma.unit.create({ data: { name, facilityId } });
  return u;
}

async function createStaff(opts: {
  email: string; facilityId: string; organizationId: string; unitId: string; cert: Certification;
  firstName?: string; lastName?: string; role?: Role;
}) {
  const nm = opts.firstName ? { firstName: opts.firstName, lastName: opts.lastName! } : nextName();
  const passwordHash = await bcrypt.hash("Password123!", 12);
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: { certification: opts.cert, hourlyRate: RATE[opts.cert], facilityId: opts.facilityId, organizationId: opts.organizationId },
    create: {
      email: opts.email, passwordHash, ...nm,
      role: opts.role ?? Role.STAFF, certification: opts.cert, hourlyRate: RATE[opts.cert],
      facilityId: opts.facilityId, organizationId: opts.organizationId,
    },
  });
  await prisma.unitStaffAssignment.upsert({
    where: { userId_unitId: { userId: user.id, unitId: opts.unitId } },
    update: {},
    create: { userId: user.id, unitId: opts.unitId, isPrimary: true },
  });
  return user;
}

// Build a site with the given cert mix in a single unit, under one organization.
async function buildSite(name: string, slug: string, unitName: string, mix: Record<Certification, number>, organizationId: string) {
  const facility = await getOrCreateFacility(name, organizationId);
  const unit = await getOrCreateUnit(unitName, facility.id);
  const passwordHash = await bcrypt.hash("Password123!", 12);

  await prisma.user.upsert({
    where: { email: `manager@${slug}.demo` },
    update: { role: Role.MANAGER, facilityId: facility.id, organizationId },
    create: { email: `manager@${slug}.demo`, passwordHash, firstName: "Mgr", lastName: name.split(" ")[0], role: Role.MANAGER, facilityId: facility.id, organizationId },
  });

  let made = 0;
  for (const cert of ["RN", "LPN", "CCA"] as Certification[]) {
    for (let i = 0; i < (mix[cert] || 0); i++) {
      await createStaff({ email: `${slug}.${cert.toLowerCase()}${i + 1}@demo`, facilityId: facility.id, organizationId, unitId: unit.id, cert });
      made++;
    }
  }
  return { facility, unit, made };
}

async function wipe() {
  // Clear demo data in FK-safe order so each seed run is clean.
  await prisma.swapRequest.deleteMany();
  await prisma.clockInEvent.deleteMany();
  await prisma.callInReport.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.timecardApproval.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.schedulePeriod.deleteMany();
  await prisma.unitStaffAssignment.deleteMany();
  await prisma.user.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.facility.deleteMany();
  await prisma.organization.deleteMany();
}

async function main() {
  console.log("Seeding certified multi-tenant demo...");
  await wipe();

  // ── Tenant A: "Demo Health Group" — three sites, one admin over all three ──
  const orgA = await prisma.organization.create({ data: { name: "Demo Health Group" } });

  // Showcase site: 15 certified staff (5 RN, 5 LPN, 5 CCA)
  const sunrise = await buildSite("Sunrise Nursing Home", "sunrise", "East Wing", { RN: 5, LPN: 5, CCA: 5 }, orgA.id);
  // Two more sites for multi-site (6 staff each: 2 per cert)
  await buildSite("Lakeside Care Center", "lakeside", "North Ward", { RN: 2, LPN: 2, CCA: 2 }, orgA.id);
  await buildSite("Meadowview Senior Living", "meadowview", "Garden Unit", { RN: 2, LPN: 2, CCA: 2 }, orgA.id);

  // ── Tenant B: "Northstar Care Group" — a SEPARATE customer, used to prove ──
  // ── isolation. Tenant A's admin must never see or touch any of this. ──────
  const orgB = await prisma.organization.create({ data: { name: "Northstar Care Group" } });
  const northstar = await buildSite("Northstar Manor", "northstar", "Main Floor", { RN: 2, LPN: 1, CCA: 1 }, orgB.id);

  const passwordHash = await bcrypt.hash("Password123!", 12);

  // Tenant A admin (oversees Org A's three sites only)
  await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: { role: Role.ADMIN, facilityId: sunrise.facility.id, organizationId: orgA.id, certification: null },
    create: { email: "admin@demo.com", passwordHash, firstName: "Ava", lastName: "Admin", role: Role.ADMIN, facilityId: sunrise.facility.id, organizationId: orgA.id },
  });

  // Tenant B admin (oversees Org B only) — the "other customer"
  await prisma.user.upsert({
    where: { email: "admin@northstar.demo" },
    update: { role: Role.ADMIN, facilityId: northstar.facility.id, organizationId: orgB.id, certification: null },
    create: { email: "admin@northstar.demo", passwordHash, firstName: "Nick", lastName: "Northstar", role: Role.ADMIN, facilityId: northstar.facility.id, organizationId: orgB.id },
  });

  // Keep the simple staff login — an RN at Sunrise East Wing (Tenant A)
  const nurse = await prisma.user.upsert({
    where: { email: "nurse@demo.com" },
    update: { certification: Certification.RN, hourlyRate: RATE.RN, facilityId: sunrise.facility.id, organizationId: orgA.id },
    create: { email: "nurse@demo.com", passwordHash, firstName: "Nora", lastName: "Nurse", role: Role.STAFF, certification: Certification.RN, hourlyRate: RATE.RN, facilityId: sunrise.facility.id, organizationId: orgA.id },
  });
  await prisma.unitStaffAssignment.upsert({
    where: { userId_unitId: { userId: nurse.id, unitId: sunrise.unit.id } },
    update: {},
    create: { userId: nurse.id, unitId: sunrise.unit.id, isPrimary: true },
  });

  const counts = await prisma.user.groupBy({ by: ["certification"], _count: true });
  console.log("\nSeed complete. Staff by certification:");
  counts.forEach((c) => console.log(`  ${c.certification ?? "—(admin/mgr)"}: ${c._count}`));
  console.log("\nLogins (password: Password123!):");
  console.log("  TENANT A ADMIN (3 sites) -> admin@demo.com");
  console.log("  TENANT A MANAGER         -> manager@sunrise.demo");
  console.log("  TENANT A STAFF (RN)      -> nurse@demo.com");
  console.log("  TENANT B ADMIN (other)   -> admin@northstar.demo");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

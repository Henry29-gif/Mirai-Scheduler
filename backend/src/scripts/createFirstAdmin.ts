import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Create the FIRST real organization + facility + admin on an empty database.
 *
 * Production starts with no data and there's no public sign-up, so run this
 * ONCE to bootstrap your first login. Everything else (more sites, staff) is
 * managed from the app afterwards.
 *
 * Usage — set the variables, then run `npm run setup:admin`:
 *   ADMIN_EMAIL=you@yourorg.com  ADMIN_PASSWORD='a-strong-password' \
 *   ORG_NAME="Your Company"  FACILITY_NAME="Main Site"  npm run setup:admin
 *
 * On Render: open the API service ▸ "Shell", set the vars, run the command.
 * Safe to re-run: if a user with that email already exists, nothing changes.
 */
const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (optionally ORG_NAME, FACILITY_NAME, UNIT_NAME, ADMIN_FIRST, ADMIN_LAST, TIMEZONE).");
  }
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters.");

  const orgName      = process.env.ORG_NAME?.trim()      || "My Organization";
  const facilityName = process.env.FACILITY_NAME?.trim() || "Main Facility";
  const unitName     = process.env.UNIT_NAME?.trim()     || "Main Unit";
  const firstName    = process.env.ADMIN_FIRST?.trim()   || "Admin";
  const lastName     = process.env.ADMIN_LAST?.trim()    || "User";
  const timezone     = process.env.TIMEZONE?.trim()      || "America/Halifax";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ A user with ${email} already exists — nothing to do.`);
    return;
  }

  const org = await prisma.organization.create({ data: { name: orgName } });
  const facility = await prisma.facility.create({ data: { name: facilityName, timezone, organizationId: org.id } });
  await prisma.unit.create({ data: { name: unitName, facilityId: facility.id } });
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email, passwordHash, firstName, lastName,
      role: Role.ADMIN, certification: null,
      facilityId: facility.id, organizationId: org.id,
    },
  });

  console.log("\n✅ First admin created!");
  console.log(`   Organization : ${orgName}`);
  console.log(`   Facility     : ${facilityName}  (unit: ${unitName})`);
  console.log(`   Admin login  : ${email}`);
  console.log("\n   Sign in on the web or mobile app with that email + the password you set.\n");
}

main()
  .catch((e) => { console.error("✗ Setup failed:", e?.message || e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

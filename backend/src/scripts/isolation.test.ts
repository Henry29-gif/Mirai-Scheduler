/**
 * Multi-tenant isolation test (run against the live API on :4000).
 *   npx tsx src/scripts/isolation.test.ts
 *
 * Proves that Tenant A's admin cannot see or touch Tenant B's data. Exits
 * non-zero if any check fails, so it can gate a release.
 */
const BASE = process.env.API_URL || "http://127.0.0.1:4000";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function login(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" }),
  });
  if (!r.ok) throw new Error(`login failed for ${email}: ${r.status}`);
  return (await r.json()).token;
}

async function get(path: string, token: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function main() {
  console.log(`\nMulti-tenant isolation test against ${BASE}\n`);
  const aAdmin = await login("admin@demo.com");          // Tenant A
  const bAdmin = await login("admin@northstar.demo");    // Tenant B

  // Tenant B's facility id, discovered via B's own admin.
  const bFac = (await get("/api/facilities", bAdmin)).body.facilities?.[0];
  if (!bFac) throw new Error("Could not load Tenant B facility");
  const bFacilityId: string = bFac.id;

  // 1. A's facility list must not contain B's facility.
  const aFacs = (await get("/api/facilities", aAdmin)).body.facilities || [];
  check("A's facility list excludes B's site", !aFacs.some((f: any) => f.id === bFacilityId),
    `got ${aFacs.length} sites`);
  check("A sees exactly its own 3 sites", aFacs.length === 3, `got ${aFacs.length}`);

  // 2. A cannot read B's data via ?facilityId override → expect 403.
  const probes = [
    `/api/users?facilityId=${bFacilityId}`,
    `/api/shifts/audit?facilityId=${bFacilityId}`,
    `/api/shifts/open?month=6&year=2026&facilityId=${bFacilityId}`,
    `/api/clock/attendance?facilityId=${bFacilityId}`,
    `/api/clock/facility-timecards?facilityId=${bFacilityId}`,
  ];
  for (const p of probes) {
    const { status } = await get(p, aAdmin);
    check(`A blocked from ${p.split("?")[0]}`, status === 403, `got HTTP ${status}`);
  }

  // 3. Sanity: B CAN read its own data (isolation didn't break normal access).
  const bUsers = await get(`/api/users?facilityId=${bFacilityId}`, bAdmin);
  check("B can read its own staff", bUsers.status === 200 && Array.isArray(bUsers.body.users));

  console.log(`\n${failed === 0 ? "✅ PASS" : "❌ FAIL"} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Business-rule tests against the LIVE API on :4000 (start the backend first).
 *
 *   npm run test:api
 *
 * Covers: pay visibility (ADMIN-only), role guards, staff schedule scoping,
 * and end-to-end auto-scheduler invariants (cert match, no rest violations,
 * unfilled → OPEN) by generating a real draft for a far-future month on
 * Tenant B (Northstar). That draft is invisible to staff and is wiped and
 * regenerated on every run — it does not touch Tenant A's demo data.
 *
 * Note: /api/auth is rate-limited to 20 logins per 15 min per IP; this file
 * performs 5. Many back-to-back runs can trip the limiter — wait it out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRest, Span } from "../utils/rest";

const BASE = process.env.API_URL || "http://127.0.0.1:4000";
const PASSWORD = "Password123!";

async function login(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login failed for ${email}: ${r.status}`);
  return ((await r.json()) as { token: string }).token;
}
async function get(path: string, token?: string) {
  const r = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
async function post(path: string, token: string, body: any, method = "POST") {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}

// Shared session state (node:test runs tests in this file serially, in order).
let admin = "", manager = "", nurse = "", adminB = "";

test("setup: all demo roles can sign in", async () => {
  [admin, manager, nurse, adminB] = await Promise.all([
    login("admin@demo.com"), login("manager@sunrise.demo"),
    login("nurse@demo.com"), login("admin@northstar.demo"),
  ]);
  assert.ok(admin && manager && nurse && adminB);
});

test("auth: wrong password is rejected", async () => {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nurse@demo.com", password: "wrong-password-123" }),
  });
  assert.equal(r.status, 401);
});

test("auth: requests without a token are rejected", async () => {
  assert.equal((await get("/api/users/me")).status, 401);
});

// ── Pay visibility: hourlyRate / costs are ADMIN-only ───────────────────────
test("pay: staff never see hourlyRate in the team list", async () => {
  const { status, body } = await get("/api/users", nurse);
  assert.equal(status, 200);
  assert.ok(body.users.length > 0, "team list should not be empty");
  for (const u of body.users) assert.ok(!("hourlyRate" in u), `hourlyRate leaked for ${u.firstName}`);
});

test("pay: managers never see hourlyRate in the team list", async () => {
  const { body } = await get("/api/users", manager);
  for (const u of body.users) assert.ok(!("hourlyRate" in u), `hourlyRate leaked for ${u.firstName}`);
});

test("pay: admins DO see hourlyRate in the team list", async () => {
  const { body } = await get("/api/users", admin);
  assert.ok(body.users.some((u: any) => typeof u.hourlyRate === "number"),
    "admin should see pay rates");
});

test("pay: shift candidates hide cost fields from managers, show them to admins", async () => {
  // Find any shift via the manager's schedule, then compare candidate payloads.
  const now = new Date();
  const sched = await get(`/api/schedules?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, manager);
  const shift = sched.body.shifts?.[0];
  assert.ok(shift, "expected at least one shift this month (seeded demo data)");
  const [mgr, adm] = await Promise.all([
    get(`/api/shifts/${shift.id}/candidates`, manager),
    get(`/api/shifts/${shift.id}/candidates`, admin),
  ]);
  assert.equal(mgr.status, 200);
  for (const c of mgr.body.candidates) {
    assert.ok(!("hourlyRate" in c) && !("shiftCost" in c) && !("_otCost" in c),
      `cost fields leaked to manager for candidate ${c.name}`);
  }
  if (adm.body.candidates.length > 0) {
    assert.ok(adm.body.candidates.every((c: any) => "shiftCost" in c), "admin should see shiftCost");
    assert.ok(adm.body.candidates.every((c: any) => !("_otCost" in c)), "_otCost is internal and must never be sent");
  }
});

test("pay: payroll timesheet is ADMIN-only", async () => {
  const now = new Date();
  const q = `month=${now.getMonth() + 1}&year=${now.getFullYear()}`;
  assert.equal((await get(`/api/schedules/timesheet?${q}`, manager)).status, 403);
  assert.equal((await get(`/api/schedules/timesheet?${q}`, nurse)).status, 403);
  assert.equal((await get(`/api/schedules/timesheet?${q}`, admin)).status, 200);
});

// ── Role guards ──────────────────────────────────────────────────────────────
test("roles: staff cannot generate schedules, see workload, or read the roster", async () => {
  const now = new Date();
  assert.equal((await post("/api/schedules/generate", nurse, { month: now.getMonth() + 1, year: now.getFullYear() })).status, 403);
  assert.equal((await get(`/api/schedules/workload?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, nurse)).status, 403);
  assert.equal((await get(`/api/staff/roster?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, nurse)).status, 403);
});

test("roles: the HR roster (My Staff) is ADMIN-only — managers are blocked too", async () => {
  const now = new Date();
  assert.equal((await get(`/api/staff/roster?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, manager)).status, 403);
});

// ── Staff schedule scoping ───────────────────────────────────────────────────
test("scoping: staff see only their own PUBLISHED shifts", async () => {
  const me = (await get("/api/users/me", nurse)).body.user;
  const now = new Date();
  const { status, body } = await get(`/api/schedules?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, nurse);
  if (status === 404) return; // no published schedule this month — nothing to leak
  for (const s of body.shifts) {
    assert.equal(s.status, "PUBLISHED", "staff must never see DRAFT/OPEN via the schedule");
    assert.equal(s.staff?.id, me.id, "staff must only see their own shifts");
  }
});

// ── Auto-scheduler invariants (end-to-end, on Tenant B's far-future month) ──
test("scheduler: generated month honors certs, rest rule, and OPEN fallback", async () => {
  // A month ~5 months out so it can't collide with any real demo period.
  const d = new Date();
  const target = new Date(d.getFullYear(), d.getMonth() + 5, 1);
  const month = target.getMonth() + 1, year = target.getFullYear();

  const fac = (await get("/api/facilities", adminB)).body.facilities?.[0];
  assert.ok(fac, "Tenant B facility should exist");

  // Unset staffing counts default to 0 (nothing scheduled), so define the
  // month's needs first: 1 of each role per shift — except day 1, explicitly
  // zeroed, which must therefore produce NO shifts at all.
  const SH = ["Day", "Evening", "Night"], CE = ["RN", "LPN", "CCA"];
  const daysInMonth = new Date(year, month, 0).getDate();
  const reqs: { date: string; shift: string; certification: string; count: number }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    for (const s of SH) for (const c of CE) reqs.push({ date, shift: s, certification: c, count: day === 1 ? 0 : 1 });
  }
  const put = await post("/api/schedules/requirements", adminB, { facilityId: fac.id, requirements: reqs }, "PUT");
  assert.equal(put.status, 200, `saving staffing needs failed: ${JSON.stringify(put.body)}`);

  const gen = await post("/api/schedules/generate", adminB, { month, year, facilityId: fac.id });
  assert.equal(gen.status, 201, `generate failed: ${JSON.stringify(gen.body)}`);
  assert.ok(gen.body.shiftsCreated > 0, "expected some shifts to be created");

  const { body } = await get(`/api/schedules?month=${month}&year=${year}&facilityId=${fac.id}`, adminB);
  const shifts = body.shifts as any[];
  assert.ok(shifts.length > 0);

  // The zeroed day must be completely empty — count 0 means nobody scheduled,
  // not even an OPEN slot.
  assert.ok(shifts.every((s) => new Date(s.startTime).getDate() !== 1),
    "a day explicitly set to 0 must produce no shifts");

  const byStaff = new Map<string, Span[]>();
  for (const s of shifts) {
    // Certification: an assigned staffer must hold the required cert.
    if (s.staff) {
      assert.equal(s.staff.certification, s.requiredCertification,
        `cert mismatch: ${s.staff.firstName} (${s.staff.certification}) on a ${s.requiredCertification} shift`);
      const list = byStaff.get(s.staff.id) || [];
      list.push({ startTime: new Date(s.startTime), endTime: new Date(s.endTime) });
      byStaff.set(s.staff.id, list);
    } else {
      // Unfilled slots become OPEN board entries, never silent gaps.
      assert.equal(s.status, "OPEN");
      assert.equal(s.openReason, "UNFILLED");
    }
  }

  // Rest rule: re-validate every staffer's generated shifts with checkRest —
  // no overlaps, no <8h gaps, doubles at most (no triples).
  for (const [staffId, spans] of byStaff) {
    for (let i = 0; i < spans.length; i++) {
      const others = spans.filter((_, j) => j !== i);
      const r = checkRest(others, spans[i].startTime, spans[i].endTime);
      assert.ok(r.ok, `rest violation for staff ${staffId} at ${spans[i].startTime.toISOString()}: ${!r.ok && r.reason}`);
    }
  }

  // Fairness sanity: with no availability blocks seeded on Tenant B, staff
  // sharing a certification should get near-equal loads (greedy fewest-hours).
  const perStaffCount = new Map<string, { cert: string; n: number }>();
  for (const s of shifts) {
    if (!s.staff) continue;
    const cur = perStaffCount.get(s.staff.id) || { cert: s.requiredCertification, n: 0 };
    cur.n++;
    perStaffCount.set(s.staff.id, cur);
  }
  const certGroups = new Map<string, number[]>();
  for (const { cert, n } of perStaffCount.values()) {
    certGroups.set(cert, [...(certGroups.get(cert) || []), n]);
  }
  for (const [cert, counts] of certGroups) {
    if (counts.length < 2) continue;
    const spread = Math.max(...counts) - Math.min(...counts);
    assert.ok(spread <= 2, `unfair ${cert} distribution: counts ${counts.join(", ")}`);
  }

  // Draft invisibility: Tenant B staff can see nothing of this draft.
  // (No Tenant B staff login seeded — assert via Tenant A's nurse instead:
  // cross-tenant AND draft, both must fail.)
  const probe = await get(`/api/schedules?month=${month}&year=${year}&facilityId=${fac.id}`, nurse);
  assert.notEqual(probe.status, 200, "Tenant A staff must not read Tenant B's draft");
});

// Runs after the scheduler test on the same generated far-future month.
test("ad-hoc shift: admin adds a single shift; cert + rest rules enforced", async () => {
  const d = new Date();
  const target = new Date(d.getFullYear(), d.getMonth() + 5, 1);
  const month = target.getMonth() + 1, year = target.getFullYear();
  const fac = (await get("/api/facilities", adminB)).body.facilities?.[0];
  const dateStr = `${year}-${String(month).padStart(2, "0")}-05`;

  // Without staffId the slot is posted to the open board as UNFILLED.
  const open = await post("/api/shifts", adminB, { date: dateStr, slot: "Day", certification: "RN", facilityId: fac.id });
  assert.equal(open.status, 201, JSON.stringify(open.body));
  assert.equal(open.body.shift.status, "OPEN");
  assert.equal(open.body.shift.openReason, "UNFILLED");

  // slot-candidates offers only rest-safe, cert-matched staff; assign the top one.
  const cands = (await get(`/api/shifts/slot-candidates?date=${dateStr}&slot=Evening&certification=RN&facilityId=${fac.id}`, adminB)).body.candidates || [];
  if (cands.length > 0) {
    const created = await post("/api/shifts", adminB, { date: dateStr, slot: "Evening", certification: "RN", staffId: cands[0].id, facilityId: fac.id });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.shift.status, "DRAFT", "added to a draft month → shift stays draft");
  }

  // all=1 lists EVERYONE (all roles) with an eligibility flag; people already
  // working that slot appear as rest-blocked instead of vanishing.
  const everyone = (await get(`/api/shifts/slot-candidates?date=${dateStr}&slot=Day&all=1&facilityId=${fac.id}`, adminB)).body.candidates || [];
  assert.ok(everyone.length > 0);
  assert.ok(everyone.every((c: any) => typeof c.eligible === "boolean"), "every row carries an eligible flag");
  assert.ok(new Set(everyone.map((c: any) => c.certification)).size > 1, "all roles should be listed");
  assert.ok(everyone.some((c: any) => c.eligible === false && c.reason === "rest"), "slot-workers must appear as rest-blocked");

  const sched = (await get(`/api/schedules?month=${month}&year=${year}&facilityId=${fac.id}`, adminB)).body.shifts as any[];
  // Rest rule: whoever already works Day·RN that date can't be double-booked into the same slot.
  const busy = sched.find((s) => s.staff && s.requiredCertification === "RN" && new Date(s.startTime).getDate() === 5 && (s.notes || "").startsWith("Day"));
  if (busy) {
    const clash = await post("/api/shifts", adminB, { date: dateStr, slot: "Day", certification: "RN", staffId: busy.staff.id, facilityId: fac.id });
    assert.equal(clash.status, 400, "double-booking the same slot must be rejected");
  }
  // Cert rule: an LPN can't be given an RN shift.
  const lpn = sched.find((s) => s.staff && s.staff.certification === "LPN");
  if (lpn) {
    const wrong = await post("/api/shifts", adminB, { date: dateStr, slot: "Night", certification: "RN", staffId: lpn.staff.id, facilityId: fac.id });
    assert.equal(wrong.status, 400, "certification mismatch must be rejected");
  }
  // Role guard: staff can't create shifts.
  assert.equal((await post("/api/shifts", nurse, { date: dateStr, slot: "Day", certification: "RN" })).status, 403);
});

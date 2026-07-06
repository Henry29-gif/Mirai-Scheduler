/**
 * Unit tests for the rest / double-shift rule (utils/rest.ts) — the single
 * source of truth for "can this person work this shift?". Every scheduling
 * path (generator, drag-and-drop, reassign, staff pickup) calls checkRest,
 * so a regression here would silently produce illegal schedules.
 *
 *   npm run test:unit    (no server or database needed)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRest, MIN_REST_HOURS, MAX_CONSECUTIVE_HOURS, Span } from "../utils/rest";

// Shift helper: at(dayOffset, hour, durationH) → a Span on a fixed base date.
// Hours may exceed 24 to spill into the next day (e.g. at(0, 23, 8) ends 07:00+1d).
const BASE = new Date("2026-03-10T00:00:00");
const at = (day: number, hour: number, durationH: number): Span => {
  const start = new Date(BASE.getTime() + day * 24 * 36e5 + hour * 36e5);
  return { startTime: start, endTime: new Date(start.getTime() + durationH * 36e5) };
};
// The standard slots used by the scheduler: Day 07–15, Evening 15–23, Night 23–07.
const DAY = (d = 0) => at(d, 7, 8);
const EVENING = (d = 0) => at(d, 15, 8);
const NIGHT = (d = 0) => at(d, 23, 8);

test("rule constants: 8h rest, 16h max consecutive (double ok, triple not)", () => {
  assert.equal(MIN_REST_HOURS, 8);
  assert.equal(MAX_CONSECUTIVE_HOURS, 16);
});

test("no other shifts → allowed", () => {
  assert.deepEqual(checkRest([], DAY().startTime, DAY().endTime), { ok: true });
});

test("identical shift already worked → overlap", () => {
  const r = checkRest([DAY()], DAY().startTime, DAY().endTime);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "overlap");
});

test("partially overlapping shift → overlap", () => {
  const r = checkRest([at(0, 10, 8)], DAY().startTime, DAY().endTime); // 10–18 vs 07–15
  assert.equal(!r.ok && r.reason, "overlap");
});

test("candidate fully inside an existing shift → overlap", () => {
  const r = checkRest([at(0, 6, 12)], at(0, 8, 4).startTime, at(0, 8, 4).endTime);
  assert.equal(!r.ok && r.reason, "overlap");
});

test("previous shift ended less than 8h before → rest violation", () => {
  // Existing ends 04:00; candidate Day starts 07:00 → only 3h rest.
  const r = checkRest([at(0, -4, 8)], DAY().startTime, DAY().endTime);
  assert.equal(!r.ok && r.reason, "rest");
});

test("previous shift ended exactly 8h before → allowed", () => {
  // Night ends 07:00; next Evening starts 15:00 → exactly 8h rest.
  const r = checkRest([NIGHT(0)], EVENING(1).startTime, EVENING(1).endTime);
  assert.deepEqual(r, { ok: true });
});

test("next shift starts less than 8h after → rest violation", () => {
  // Candidate Day ends 15:00; existing starts 19:00 → only 4h rest.
  const r = checkRest([at(0, 19, 8)], DAY().startTime, DAY().endTime);
  assert.equal(!r.ok && r.reason, "rest");
});

test("next shift starts exactly 8h after → allowed", () => {
  // Candidate Day ends 15:00; existing Night starts 23:00 → exactly 8h rest.
  const r = checkRest([NIGHT(0)], DAY().startTime, DAY().endTime);
  assert.deepEqual(r, { ok: true });
});

test("double: picking up the shift right after mine (16h straight) → allowed", () => {
  const r = checkRest([DAY()], EVENING().startTime, EVENING().endTime);
  assert.deepEqual(r, { ok: true });
});

test("double: picking up the shift right before mine → allowed", () => {
  const r = checkRest([EVENING()], DAY().startTime, DAY().endTime);
  assert.deepEqual(r, { ok: true });
});

test("triple: candidate bridges two touching shifts (24h straight) → blocked", () => {
  // Working Day and Night; picking up the Evening between them = 07:00→07:00.
  const r = checkRest([DAY(), NIGHT()], EVENING().startTime, EVENING().endTime);
  assert.equal(!r.ok && r.reason, "max-consecutive");
});

test("triple: third back-to-back shift after a double → blocked", () => {
  const r = checkRest([DAY(), EVENING()], NIGHT().startTime, NIGHT().endTime);
  assert.equal(!r.ok && r.reason, "max-consecutive");
});

test("a 12h pickup touching an existing 8h shift (20h block) → blocked", () => {
  const r = checkRest([DAY()], at(0, 15, 12).startTime, at(0, 15, 12).endTime);
  assert.equal(!r.ok && r.reason, "max-consecutive");
});

test("after a double, the next shift 8h from the BLOCK end → allowed", () => {
  // Double Day+Evening ends 23:00; next Day starts 07:00+1d → exactly 8h rest.
  const r = checkRest([DAY(0), EVENING(0)], DAY(1).startTime, DAY(1).endTime);
  assert.deepEqual(r, { ok: true });
});

test("after a double, a shift less than 8h from the BLOCK end → rest violation", () => {
  // Double Day+Evening ends 23:00; existing Night 23:00+? No — use a shift at
  // 05:00 next day (6h after the block ends). Candidate = the Evening leg.
  const r = checkRest([DAY(0), at(1, 5, 8)], EVENING(0).startTime, EVENING(0).endTime);
  assert.equal(!r.ok && r.reason, "rest");
});

test("shifts on other days far away → allowed", () => {
  const r = checkRest([DAY(0), DAY(2), NIGHT(3)], DAY(1).startTime, DAY(1).endTime);
  assert.deepEqual(r, { ok: true });
});

test("violation reports which existing shift is in the way", () => {
  const conflict = at(0, 19, 8);
  const r = checkRest([conflict], DAY().startTime, DAY().endTime);
  assert.equal(!r.ok && r.conflict, conflict);
});

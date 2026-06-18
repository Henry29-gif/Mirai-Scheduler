/**
 * REST / DOUBLE-SHIFT RULE
 * ───────────────────────
 * One source of truth for "can this person work this shift?", used by the
 * auto-scheduler, the calendar drag-and-drop, manager reassignment, and staff
 * pickup so every path behaves identically.
 *
 * Rules (no weekly-hours cap):
 *   • No overlapping shifts (can't be in two places at once).
 *   • A staffer may work up to a DOUBLE — two back-to-back 8h shifts = 16h
 *     straight — when needed.
 *   • TRIPLES are not allowed (no 24h straight); the consecutive run is capped
 *     at 16h.
 *   • At least 8 hours of rest between separate work blocks (and after a double).
 */

export const MIN_REST_HOURS = 8;
export const MAX_CONSECUTIVE_HOURS = 16; // a double is fine; a triple (24h) is not
const REST_MS = MIN_REST_HOURS * 36e5;
const MAX_CONSEC_MS = MAX_CONSECUTIVE_HOURS * 36e5;

export interface Span { startTime: Date; endTime: Date; notes?: string | null }

export type RestResult =
  | { ok: true }
  | { ok: false; reason: "overlap" | "rest" | "max-consecutive"; conflict: Span | null };

/**
 * Can a staffer work [candStart, candEnd] given their OTHER shifts (`existing`)?
 * `existing` must NOT include the candidate shift itself.
 */
export function checkRest(existing: Span[], candStart: Date, candEnd: Date): RestResult {
  const cs = candStart.getTime();
  const ce = candEnd.getTime();

  // 1) No overlap.
  for (const x of existing) {
    if (x.startTime.getTime() < ce && x.endTime.getTime() > cs) {
      return { ok: false, reason: "overlap", conflict: x };
    }
  }

  // 2) Merge the candidate with any shifts that touch it (back-to-back) into one
  //    continuous work block.
  let blockStart = cs;
  let blockEnd = ce;
  const merged = new Set<Span>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const x of existing) {
      if (merged.has(x)) continue;
      const xs = x.startTime.getTime();
      const xe = x.endTime.getTime();
      if (xe === blockStart) { blockStart = xs; merged.add(x); grew = true; }
      else if (xs === blockEnd) { blockEnd = xe; merged.add(x); grew = true; }
    }
  }

  // 3) That continuous block can't exceed a double (16h) — i.e. no triples.
  if (blockEnd - blockStart > MAX_CONSEC_MS) {
    return { ok: false, reason: "max-consecutive", conflict: [...merged][0] ?? null };
  }

  // 4) Every other (non-touching) shift must be at least 8h away from the block.
  for (const x of existing) {
    if (merged.has(x)) continue;
    const xs = x.startTime.getTime();
    const xe = x.endTime.getTime();
    const gap = xe <= blockStart ? blockStart - xe : xs - blockEnd;
    if (gap < REST_MS) return { ok: false, reason: "rest", conflict: x };
  }

  return { ok: true };
}

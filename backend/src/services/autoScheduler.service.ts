/**
 * AUTO-SCHEDULER SERVICE
 * ───────────────────────
 * Generates a fair monthly schedule for all units in a facility.
 *
 * Algorithm:
 *  1. For each unit, load all assigned staff.
 *  2. Calculate the target hours per staff member for the month
 *     (total unit-hours ÷ staff count).
 *  3. For each day × shift-slot (e.g. 07:00-15:00, 15:00-23:00, 23:00-07:00),
 *     assign the staff member with the fewest accumulated hours who:
 *       - Satisfies the 8-hour rest rule (a 16h double is allowed; no triples)
 *  4. Persist all Shift records with status=DRAFT.
 *  5. Return a summary for the admin to review before publishing.
 */

import { addDays, addHours, getDaysInMonth, setDate, setHours, setMinutes, setSeconds, startOfMonth } from "date-fns";
import { Certification } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { checkRest } from "../utils/rest";

// Shift slots: morning / afternoon / night  (24-h format)
const SHIFT_SLOTS = [
  { label: "Day",     startH: 7,  durationH: 8 },
  { label: "Evening", startH: 15, durationH: 8 },
  { label: "Night",   startH: 23, durationH: 8 },
];

// Each slot must be covered by one of each certification.
const REQUIRED_CERTS: Certification[] = ["RN", "LPN", "CCA"];

interface StaffState {
  userId: string;
  certification: Certification | null;
  accumulatedHours: number;
  lastShiftEnd: Date | null;
  assigned: { startTime: Date; endTime: Date }[]; // shifts already given to this person
}

export async function generateMonthlySchedule(
  facilityId: string,
  month: number, // 1-12
  year: number,
  opts?: { startDate?: string; endDate?: string } // optional YYYY-MM-DD range within the month
): Promise<{ schedulePeriodId: string; shiftsCreated: number; openShifts: number; warnings: string[] }> {
  logger.info(`[AutoScheduler] Starting for facility=${facilityId} ${year}-${month}`);

  const warnings: string[] = [];
  let openShiftCount = 0;

  // ── 1. Upsert SchedulePeriod ────────────────────────────────────────────
  const schedulePeriod = await prisma.schedulePeriod.upsert({
    where:  { facilityId_month_year: { facilityId, month, year } },
    create: { facilityId, month, year, status: "DRAFT" },
    update: { status: "DRAFT", generatedAt: new Date() },
  });

  // Regenerating replaces the ENTIRE period (including a previously-posted
  // schedule) with a fresh draft — so clear all of the period's existing shifts.
  // First clear records that reference those shifts so FKs don't block the delete.
  const oldShifts = await prisma.shift.findMany({
    where: { schedulePeriodId: schedulePeriod.id },
    select: { id: true },
  });
  const oldIds = oldShifts.map((s) => s.id);
  if (oldIds.length) {
    await prisma.swapRequest.deleteMany({ where: { OR: [{ originalShiftId: { in: oldIds } }, { offeredShiftId: { in: oldIds } }] } });
    await prisma.clockInEvent.deleteMany({ where: { shiftId: { in: oldIds } } });
    await prisma.callInReport.deleteMany({ where: { shiftId: { in: oldIds } } });
  }
  await prisma.shift.deleteMany({ where: { schedulePeriodId: schedulePeriod.id } });

  // ── 2. Load units and their staff ───────────────────────────────────────
  const units = await prisma.unit.findMany({
    where: { facilityId },
    include: {
      staffAssignments: {
        where:   { user: { isActive: true } },
        include: { user: true },
      },
    },
  });

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const monthStart  = startOfMonth(new Date(year, month - 1));
  const monthEnd    = addDays(monthStart, daysInMonth);
  let totalShifts   = 0;

  // Optional date range (YYYY-MM-DD) — only schedule days within it. Defaults to
  // the whole month; clamped to the month and to start <= end.
  const mm = String(month).padStart(2, "0");
  const firstDayStr = `${year}-${mm}-01`;
  const lastDayStr  = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;
  const rangeStartStr = opts?.startDate && opts.startDate >= firstDayStr && opts.startDate <= lastDayStr ? opts.startDate : firstDayStr;
  const rangeEndStr   = opts?.endDate   && opts.endDate   >= rangeStartStr && opts.endDate   <= lastDayStr ? opts.endDate   : lastDayStr;

  // ── Load APPROVED leave overlapping this month → block those staff. ──────
  const leaves = await prisma.timeOffRequest.findMany({
    where: { facilityId, status: "APPROVED", startDate: { lt: monthEnd }, endDate: { gte: monthStart } },
    select: { userId: true, startDate: true, endDate: true },
  });
  // Compare by calendar day (YYYY-MM-DD) to avoid timezone boundary issues.
  const leaveRanges = new Map<string, { s: string; e: string }[]>();
  for (const l of leaves) {
    if (!leaveRanges.has(l.userId)) leaveRanges.set(l.userId, []);
    leaveRanges.get(l.userId)!.push({ s: l.startDate.toISOString().slice(0, 10), e: l.endDate.toISOString().slice(0, 10) });
  }
  const isOnLeaveDay = (userId: string, dayStr: string) =>
    (leaveRanges.get(userId) || []).some((r) => dayStr >= r.s && dayStr <= r.e);

  // ── Load recurring availability blocks (unavailable day-of-week + shift). ──
  const blocks = await prisma.availabilityBlock.findMany({
    where: { user: { facilityId } },
    select: { userId: true, dayOfWeek: true, shift: true },
  });
  const unavailable = new Set(blocks.map((b) => `${b.userId}|${b.dayOfWeek}|${b.shift}`));
  const isUnavailable = (userId: string, dow: number, shiftLabel: string) =>
    unavailable.has(`${userId}|${dow}|${shiftLabel}`);

  // ── Load manager-defined staffing requirements (how many of each cert per
  //    shift slot). Missing entries default to 0 — managers explicitly set
  //    what they need; an untouched day schedules nobody. ──
  const reqRows = await prisma.staffingRequirement.findMany({ where: { facilityId } });
  const reqMap = new Map(reqRows.map((r) => [`${r.date.toISOString().slice(0, 10)}|${r.shift}|${r.certification}`, r.count]));
  const requiredCount = (dateStr: string, shiftLabel: string, cert: Certification): number =>
    reqMap.get(`${dateStr}|${shiftLabel}|${cert}`) ?? 0;

  // ── 3. For each unit, build the schedule ────────────────────────────────
  for (const unit of units) {
    if (unit.staffAssignments.length === 0) {
      warnings.push(`Unit "${unit.name}" has no active staff — skipped.`);
      continue;
    }

    // Build per-staff state, keyed by userId, carrying each staff member's certification.
    const staffMap = new Map<string, StaffState>(
      unit.staffAssignments.map((a) => [
        a.userId,
        { userId: a.userId, certification: a.user.certification, accumulatedHours: 0, lastShiftEnd: null, assigned: [] },
      ])
    );

    const shiftsToCreate: Parameters<typeof prisma.shift.create>[0]["data"][] = [];

    // Iterate: each day × each shift slot × each required certification.
    for (let d = 0; d < daysInMonth; d++) {
      const day = addDays(monthStart, d);
      const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      if (dayStr < rangeStartStr || dayStr > rangeEndStr) continue; // outside the chosen date range

      for (const slot of SHIFT_SLOTS) {
        const shiftStart = setSeconds(setMinutes(setHours(day, slot.startH), 0), 0);
        const shiftEnd   = addHours(shiftStart, slot.durationH);

        for (const cert of REQUIRED_CERTS) {
          const need = requiredCount(dayStr, slot.label, cert); // manager-defined count for this date (default 1)
          for (let n = 0; n < need; n++) {
          // ── Find the best ELIGIBLE staff member of this certification ────
          let bestId: string | null = null;
          let bestHours             = Infinity;
          let bestLastEnd           = Infinity; // tie-break: prefer who worked longest ago

          for (const [userId, state] of staffMap.entries()) {
            if (state.certification !== cert) continue; // skill-based eligibility
            if (isOnLeaveDay(userId, dayStr)) continue; // approved time-off
            if (isUnavailable(userId, day.getDay(), slot.label)) continue; // recurring availability

            // 8h rest between work blocks; a double (16h) is fine, a triple is not.
            // No weekly-hours cap — staff can pick up doubles when needed.
            if (!checkRest(state.assigned, shiftStart, shiftEnd).ok) continue;

            // Fairest = fewest accumulated hours; tie → who worked longest ago.
            const lastEnd = state.lastShiftEnd ? state.lastShiftEnd.getTime() : 0;
            if (state.accumulatedHours < bestHours ||
                (state.accumulatedHours === bestHours && lastEnd < bestLastEnd)) {
              bestHours   = state.accumulatedHours;
              bestLastEnd = lastEnd;
              bestId      = userId;
            }
          }

          if (!bestId) {
            // No eligible staff → leave it OPEN for the open-shift board.
            shiftsToCreate.push({
              unitId:                unit.id,
              staffId:               null,
              schedulePeriodId:      schedulePeriod.id,
              startTime:             shiftStart,
              endTime:               shiftEnd,
              status:                "OPEN",
              openReason:            "UNFILLED",
              requiredCertification: cert,
              notes:                 `${slot.label} · ${cert}`,
            });
            openShiftCount++;
            continue;
          }

          // ── Assign + update state ──────────────────────────────────────
          const state = staffMap.get(bestId)!;
          state.accumulatedHours += slot.durationH;
          state.lastShiftEnd      = shiftEnd;
          state.assigned.push({ startTime: shiftStart, endTime: shiftEnd });

          shiftsToCreate.push({
            unitId:                unit.id,
            staffId:               bestId,
            schedulePeriodId:      schedulePeriod.id,
            startTime:             shiftStart,
            endTime:               shiftEnd,
            status:                "DRAFT",
            requiredCertification: cert,
            notes:                 `${slot.label} · ${cert}`,
          });
          } // next required staffer for this slot/cert
        }
      }
    }

    // ── Bulk insert shifts for this unit ────────────────────────────────
    if (shiftsToCreate.length > 0) {
      await prisma.shift.createMany({ data: shiftsToCreate as any });
      totalShifts += shiftsToCreate.filter((s: any) => s.status === "DRAFT").length;
    }

    // ── Coverage report per certification ───────────────────────────────
    for (const cert of REQUIRED_CERTS) {
      if (![...staffMap.values()].some((s) => s.certification === cert)) {
        warnings.push(`Unit "${unit.name}" has no ${cert} staff — all ${cert} shifts left open.`);
      }
    }
  }

  logger.info(`[AutoScheduler] Done — ${totalShifts} filled, ${openShiftCount} open for period ${schedulePeriod.id}`);

  return { schedulePeriodId: schedulePeriod.id, shiftsCreated: totalShifts, openShifts: openShiftCount, warnings };
}

/** Publish a draft schedule: change all DRAFT shifts to PUBLISHED */
export async function publishSchedule(schedulePeriodId: string) {
  const [period] = await prisma.$transaction([
    prisma.schedulePeriod.update({
      where: { id: schedulePeriodId },
      data:  { status: "PUBLISHED", publishedAt: new Date() },
    }),
    prisma.shift.updateMany({
      where: { schedulePeriodId, status: "DRAFT" },
      data:  { status: "PUBLISHED" },
    }),
  ]);
  return period;
}

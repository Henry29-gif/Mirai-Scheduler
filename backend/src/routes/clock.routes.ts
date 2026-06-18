import { Router } from "express";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";
import { logAudit } from "../services/audit.service";
import { notify } from "../services/notify.service";
import { resolveScopedFacility, assertFacilityInScope } from "../utils/tenant";

const router = Router();
router.use(authenticate);

async function lastEvent(userId: string) {
  return prisma.clockInEvent.findFirst({ where: { userId }, orderBy: { timestamp: "desc" } });
}

// Pair CLOCK_IN → CLOCK_OUT events (chronological) into worked sessions.
function buildSessions(events: { event: string; timestamp: Date }[]) {
  const sessions: { in: Date; out: Date | null; minutes: number | null }[] = [];
  let openIn: Date | null = null;
  for (const e of events) {
    if (e.event === "CLOCK_IN") openIn = e.timestamp;
    else if (e.event === "CLOCK_OUT" && openIn) {
      sessions.push({ in: openIn, out: e.timestamp, minutes: Math.round((e.timestamp.getTime() - openIn.getTime()) / 60000) });
      openIn = null;
    }
  }
  if (openIn) sessions.push({ in: openIn, out: null, minutes: null }); // still clocked in
  return sessions;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type DaySummary = { date: string; minutes: number; missedPunch: boolean; sessions: { in: Date; out: Date | null; minutes: number | null }[] };

// Group a user's events into worked days. An un-closed session on a *past* day
// is a missed punch (forgot to clock out); an open session today is just "in progress".
function summarizeDays(events: { event: string; timestamp: Date }[]): Record<string, DaySummary> {
  const sessions = buildSessions(events);
  const todayKey = dayKey(new Date());
  const byDay: Record<string, DaySummary> = {};
  for (const s of sessions) {
    const key = dayKey(s.in);
    byDay[key] = byDay[key] || { date: key, minutes: 0, missedPunch: false, sessions: [] };
    if (s.out) byDay[key].minutes += s.minutes || 0;
    else if (key !== todayKey) byDay[key].missedPunch = true;
    byDay[key].sessions.push(s);
  }
  return byDay;
}

// A dayKey string ("YYYY-MM-DD") → the DateTime we persist as the approval key
// (UTC midnight). Round-trips: new Date(k+"T00:00:00Z").toISOString().slice(0,10) === k.
const dayDate = (key: string) => new Date(`${key}T00:00:00Z`);

// POST /api/clock — toggle clock in / clock out.
router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const last = await lastEvent(req.user!.id);
    const event = last?.event === "CLOCK_IN" ? "CLOCK_OUT" : "CLOCK_IN";
    const { latitude, longitude } = (req.body || {}) as { latitude?: number; longitude?: number };
    const rec = await prisma.clockInEvent.create({
      data: { userId: req.user!.id, facilityId: req.user!.facilityId, event, latitude: latitude ?? null, longitude: longitude ?? null },
    });
    res.json({ event: rec.event, timestamp: rec.timestamp, clockedIn: event === "CLOCK_IN" });
  } catch (err) { next(err); }
});

// GET /api/clock/status — current state + minutes worked today.
router.get("/status", async (req: AuthRequest, res, next) => {
  try {
    const last = await lastEvent(req.user!.id);
    const clockedIn = last?.event === "CLOCK_IN";
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const events = await prisma.clockInEvent.findMany({
      where: { userId: req.user!.id, timestamp: { gte: start } }, orderBy: { timestamp: "asc" },
    });
    const sessions = buildSessions(events);
    const now = Date.now();
    let todayMinutes = 0;
    for (const s of sessions) todayMinutes += s.out ? (s.minutes || 0) : Math.round((now - s.in.getTime()) / 60000);
    res.json({ clockedIn, since: clockedIn ? last!.timestamp : null, todayMinutes });
  } catch (err) { next(err); }
});

// GET /api/clock/timecard?days=14 — the user's recent sessions grouped by day.
router.get("/timecard", async (req: AuthRequest, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 14, 60);
    const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - days + 1);
    const events = await prisma.clockInEvent.findMany({
      where: { userId: req.user!.id, timestamp: { gte: from } }, orderBy: { timestamp: "asc" },
    });
    const sessions = buildSessions(events);
    const byDay: Record<string, { date: string; minutes: number; sessions: any[] }> = {};
    for (const s of sessions) {
      const key = dayKey(s.in);
      byDay[key] = byDay[key] || { date: key, minutes: 0, sessions: [] };
      byDay[key].minutes += s.out ? (s.minutes || 0) : 0;
      byDay[key].sessions.push(s);
    }
    const list = Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date));
    res.json({ days: list, totalMinutes: list.reduce((a, d) => a + d.minutes, 0) });
  } catch (err) { next(err); }
});

// ─── Manager / admin: live attendance + facility timecards ──────────────────

const staffSel = { id: true, firstName: true, lastName: true, certification: true } as const;

// GET /api/clock/attendance — who is clocked in right now at the facility.
router.get("/attendance", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res, next) => {
  try {
    const facilityId = await resolveScopedFacility(req, req.query.facilityId as string | undefined);
    const users = await prisma.user.findMany({
      where: { facilityId, isActive: true }, select: staffSel,
    });
    const ids = users.map((u) => u.id);
    // Last event per user within 24h is enough to know current state (no shift is longer).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const events = await prisma.clockInEvent.findMany({
      where: { userId: { in: ids }, timestamp: { gte: since } }, orderBy: { timestamp: "desc" },
    });
    const lastByUser: Record<string, { event: string; timestamp: Date }> = {};
    for (const e of events) if (!lastByUser[e.userId]) lastByUser[e.userId] = e;

    const now = Date.now();
    const onNow = users
      .filter((u) => lastByUser[u.id]?.event === "CLOCK_IN")
      .map((u) => {
        const ev = lastByUser[u.id];
        return { ...u, since: ev.timestamp, minutes: Math.round((now - ev.timestamp.getTime()) / 60000) };
      })
      .sort((a, b) => a.since.getTime() - b.since.getTime()); // longest on shift first
    res.json({ onNow, totalStaff: users.length });
  } catch (err) { next(err); }
});

// GET /api/clock/facility-timecards?days=14 — every staffer's worked days,
// with missed-punch flags and per-day approval status.
router.get("/facility-timecards", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res, next) => {
  try {
    const facilityId = await resolveScopedFacility(req, req.query.facilityId as string | undefined);
    const days = Math.min(Number(req.query.days) || 14, 60);
    const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - days + 1);

    const users = await prisma.user.findMany({ where: { facilityId, isActive: true }, select: staffSel });
    const ids = users.map((u) => u.id);
    const [events, approvals] = await Promise.all([
      prisma.clockInEvent.findMany({ where: { userId: { in: ids }, timestamp: { gte: from } }, orderBy: { timestamp: "asc" } }),
      prisma.timecardApproval.findMany({ where: { userId: { in: ids }, date: { gte: dayDate(dayKey(from)) } } }),
    ]);
    const eventsByUser: Record<string, { event: string; timestamp: Date }[]> = {};
    for (const e of events) (eventsByUser[e.userId] = eventsByUser[e.userId] || []).push(e);
    const approvalByKey: Record<string, { status: string; minutes: number; reviewedAt: Date }> = {};
    for (const a of approvals) approvalByKey[`${a.userId}|${a.date.toISOString().slice(0, 10)}`] =
      { status: a.status, minutes: a.minutes, reviewedAt: a.reviewedAt };

    const staff = users.map((u) => {
      const byDay = summarizeDays(eventsByUser[u.id] || []);
      const list = Object.values(byDay)
        .map((d) => ({ ...d, approval: approvalByKey[`${u.id}|${d.date}`] || null }))
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        ...u,
        totalMinutes: list.reduce((sum, d) => sum + d.minutes, 0),
        pendingDays: list.filter((d) => !d.approval).length,
        days: list,
      };
    }).filter((s) => s.days.length > 0);

    res.json({ staff, rangeDays: days });
  } catch (err) { next(err); }
});

// Recompute a single day's completed minutes for one user (server-authoritative
// snapshot stored on approval). Pulls a ±1-day window so cross-midnight shifts
// attributed to `dayKey(clock-in)` are counted correctly.
async function dayMinutes(userId: string, key: string): Promise<number> {
  const center = dayDate(key).getTime();
  const events = await prisma.clockInEvent.findMany({
    where: { userId, timestamp: { gte: new Date(center - 24 * 3600e3), lt: new Date(center + 48 * 3600e3) } },
    orderBy: { timestamp: "asc" },
  });
  return summarizeDays(events)[key]?.minutes || 0;
}

// Confirm a staffer is in this manager's tenant scope; returns the user or null.
// Managers are limited to their own facility; admins to any facility in their org.
async function staffInScope(req: AuthRequest, userId: string) {
  const staff = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, facilityId: true, organizationId: true } });
  if (!staff) return null;
  if (req.user!.role === "ADMIN") {
    return staff.organizationId === req.user!.organizationId ? staff : null;
  }
  return staff.facilityId === req.user!.facilityId ? staff : null;
}

// POST /api/clock/approve { userId, date, note? } — sign off one day's hours.
router.post("/approve", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res, next) => {
  try {
    const { userId, date, note } = (req.body || {}) as { userId?: string; date?: string; note?: string };
    if (!userId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "userId and date (YYYY-MM-DD) are required" });
    const staff = await staffInScope(req, userId);
    if (!staff) return res.status(404).json({ message: "Staff member not found in your facility" });

    const minutes = await dayMinutes(userId, date);
    const d = dayDate(date);
    await prisma.timecardApproval.upsert({
      where: { userId_date: { userId, date: d } },
      update: { status: "APPROVED", minutes, reviewerId: req.user!.id, reviewedAt: new Date(), note: note || null },
      create: { userId, facilityId: staff.facilityId, date: d, minutes, status: "APPROVED", reviewerId: req.user!.id, note: note || null },
    });
    await logAudit({
      facilityId: staff.facilityId, actorId: req.user!.id, action: "TIMECARD_APPROVED",
      summary: `Approved ${staff.firstName} ${staff.lastName}'s hours for ${date} (${Math.round((minutes / 60) * 10) / 10}h)`,
      entityType: "TimecardApproval", entityId: `${userId}:${date}`,
    });
    await notify(userId, "Timecard approved", `Your hours for ${date} were approved.`, "success");
    res.json({ message: "Day approved ✓", minutes });
  } catch (err) { next(err); }
});

// POST /api/clock/unapprove { userId, date } — reopen a previously-approved day.
router.post("/unapprove", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res, next) => {
  try {
    const { userId, date } = (req.body || {}) as { userId?: string; date?: string };
    if (!userId || !date) return res.status(400).json({ message: "userId and date are required" });
    const staff = await staffInScope(req, userId);
    if (!staff) return res.status(404).json({ message: "Staff member not found in your facility" });

    await prisma.timecardApproval.deleteMany({ where: { userId, date: dayDate(date) } });
    await logAudit({
      facilityId: staff.facilityId, actorId: req.user!.id, action: "TIMECARD_REOPENED",
      summary: `Reopened ${staff.firstName} ${staff.lastName}'s hours for ${date}`,
      entityType: "TimecardApproval", entityId: `${userId}:${date}`,
    });
    res.json({ message: "Day reopened" });
  } catch (err) { next(err); }
});

// POST /api/clock/correct { userId, timestamp, event } — manager inserts a
// corrective punch (e.g. the clock-out a staffer forgot). Audit-logged edit.
router.post("/correct", requireRole("ADMIN", "MANAGER"), async (req: AuthRequest, res, next) => {
  try {
    const { userId, timestamp, event } = (req.body || {}) as { userId?: string; timestamp?: string; event?: string };
    const evt = event === "CLOCK_IN" ? "CLOCK_IN" : "CLOCK_OUT";
    if (!userId || !timestamp) return res.status(400).json({ message: "userId and timestamp are required" });
    const when = new Date(timestamp);
    if (isNaN(+when)) return res.status(400).json({ message: "Invalid timestamp" });
    if (when.getTime() > Date.now() + 60_000) return res.status(400).json({ message: "Timestamp can't be in the future" });
    const staff = await staffInScope(req, userId);
    if (!staff) return res.status(404).json({ message: "Staff member not found in your facility" });

    await prisma.clockInEvent.create({ data: { userId, facilityId: staff.facilityId, event: evt, timestamp: when } });
    await logAudit({
      facilityId: staff.facilityId, actorId: req.user!.id, action: "TIMECARD_PUNCH_EDITED",
      summary: `Added a ${evt === "CLOCK_OUT" ? "clock-out" : "clock-in"} for ${staff.firstName} ${staff.lastName} at ${when.toLocaleString()}`,
      entityType: "ClockInEvent", entityId: userId,
    });
    await notify(userId, "Timecard corrected", `A manager added a ${evt === "CLOCK_OUT" ? "clock-out" : "clock-in"} to your timecard for ${when.toLocaleString()}.`, "info");
    res.json({ message: "Punch added ✓" });
  } catch (err) { next(err); }
});

export default router;

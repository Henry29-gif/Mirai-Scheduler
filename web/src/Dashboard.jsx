import React, { useEffect, useState } from "react";
import { api } from "./api";
import { MONTH_NAMES, WEEKDAY_FULL } from "./format";
import { RoleBadge, ThemeToggle } from "./ui";
import { NotifBell } from "./components/NotifBell";
import { HomeView } from "./screens/HomeView";
import { MySpaceView } from "./screens/MySpaceView";
import { SchedulingView } from "./screens/SchedulingView";
import { MyStaffView } from "./screens/MyStaffView";
import { TimeoffView } from "./screens/TimeoffView";
import { AvailabilityView } from "./screens/AvailabilityView";
import { ApprovalsView } from "./screens/ApprovalsView";
import { AttendanceView } from "./screens/AttendanceView";
import { TimecardsView } from "./screens/TimecardsView";
import { MyTimecardView } from "./screens/MyTimecardView";
import { CertsView } from "./screens/CertsView";

// ── Dashboard ─────────────────────────────────────────────────────────────────
// Owns ALL the signed-in state (data + actions) and the page shell; each screen
// receives everything through the single `ctx` object built at the bottom.
export function Dashboard({ token, user, onLogout, theme, onToggleTheme }) {
  const [me, setMe] = useState(null);
  const [team, setTeam] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [scheduleMsg, setScheduleMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Multi-site + month navigation state
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const now = new Date();
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });

  // Open-shift board state
  const [openShifts, setOpenShifts] = useState([]);
  const [expanded, setExpanded] = useState(null);   // shiftId whose candidates are shown
  const [candidates, setCandidates] = useState([]);
  const [openMsg, setOpenMsg] = useState("");
  const [cost, setCost] = useState(null);           // overtime cost summary
  const [audit, setAudit] = useState([]);           // compliance log
  // Notifications
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifActed, setNotifActed] = useState({}); // notifId -> result label after Accept/Decline
  // Sub-page navigation ("More" menu)
  const [view, setView] = useState("home");
  const [moreOpen, setMoreOpen] = useState(false);
  // Time clock
  const [clock, setClock] = useState({ clockedIn: false, since: null, todayMinutes: 0 });
  const [timecard, setTimecard] = useState(null);
  // Manager attendance + timecard approvals
  const [attendance, setAttendance] = useState({ onNow: [], totalStaff: 0 });
  const [facTimecards, setFacTimecards] = useState({ staff: [], rangeDays: 14 });
  const [tcMsg, setTcMsg] = useState("");
  const [fixFor, setFixFor] = useState(null);   // `${userId}|${date}` whose fix form is open
  const [fixTime, setFixTime] = useState("");
  // Staffing needs (how many of each role per shift) — drives the auto-scheduler
  const [staffing, setStaffing] = useState([]); // [{shift, certification, count}]
  const [staffingMsg, setStaffingMsg] = useState("");
  const [staffingBusy, setStaffingBusy] = useState(false);
  // Schedule review: workload preview + admin swap (reassign) + post/publish
  const [workload, setWorkload] = useState({ periodId: null, status: null, staff: [], summary: { min: 0, max: 0, avg: 0, openShifts: 0, totalAssigned: 0 } });
  const [schedulePeriod, setSchedulePeriod] = useState(null);
  const [reassignFor, setReassignFor] = useState(null);   // shiftId whose candidate list is open
  const [reassignCands, setReassignCands] = useState(null);
  const [reassignMsg, setReassignMsg] = useState("");
  // Calendar (draft-schedule makeover): month/week toggle + drag-and-drop state
  const [calView, setCalView] = useState("month");  // 'month' | 'week'
  const [calWeek, setCalWeek] = useState(0);         // week index within the month
  const [dragId, setDragId] = useState(null);        // shift id being dragged
  const [dropId, setDropId] = useState(null);        // shift id hovered as a drop target
  // Date range to generate (defaults to the whole selected month)
  const [schedRange, setSchedRange] = useState({ start: "", end: "" });
  // My Staff (admin) — roster metrics + per-person documents
  const [roster, setRoster] = useState([]);
  const [staffExpanded, setStaffExpanded] = useState(null);
  const [staffDocs, setStaffDocs] = useState([]);
  const [staffCerts, setStaffCerts] = useState([]);    // certs of the expanded staff (admin My Staff)
  const [staffMsg, setStaffMsg] = useState("");
  // Certifications (staff self-service)
  const [certs, setCerts] = useState([]);
  const [certForm, setCertForm] = useState({ name: "", number: "", expiryDate: "" });
  const [certMsg, setCertMsg] = useState("");
  const [myDocs, setMyDocs] = useState([]);            // my own certification documents
  const [myDocMsg, setMyDocMsg] = useState("");
  // Availability state
  const [availability, setAvailability] = useState([]);

  // Time-off state
  const [timeoff, setTimeoff] = useState([]);
  const [toForm, setToForm] = useState({ startDate: "", endDate: "", type: "VACATION", reason: "" });
  const [toMsg, setToMsg] = useState("");

  // Shift-trade state
  const [swaps, setSwaps] = useState({ incoming: [], outgoing: [] });
  const [tradeFor, setTradeFor] = useState(null);   // my shift being traded
  const [tradeOpts, setTradeOpts] = useState(null); // coworker options
  const [tradeMsg, setTradeMsg] = useState("");

  const isManager = user.role === "ADMIN" || user.role === "MANAGER";
  const isAdmin = user.role === "ADMIN";
  const monthName = MONTH_NAMES[period.month - 1];
  const siteQuery = siteId ? `&facilityId=${siteId}` : "";

  function shiftMonth(delta) {
    setPeriod((p) => {
      let m = p.month + delta, y = p.year;
      if (m < 1) { m = 12; y--; }
      if (m > 12) { m = 1; y++; }
      return { month: m, year: y };
    });
  }

  async function loadSchedule() {
    setScheduleMsg("");
    try {
      const data = await api(`/api/schedules?month=${period.month}&year=${period.year}${siteQuery}`, { token });
      setSchedule(data.shifts || []);
      setSchedulePeriod(data.period || null);
    } catch (err) {
      setSchedule([]);
      setSchedulePeriod(null);
      if (!/No schedule found/i.test(err.message)) setScheduleMsg(err.message);
    }
  }

  async function loadTeam() {
    try {
      const data = await api(`/api/users?${siteId ? `facilityId=${siteId}` : ""}`, { token });
      setTeam(data.users || []);
    } catch { setTeam([]); }
  }

  async function loadOpen() {
    setExpanded(null); setCandidates([]);
    try {
      const data = await api(`/api/shifts/open?month=${period.month}&year=${period.year}${siteQuery}`, { token });
      setOpenShifts(data.openShifts || []);
    } catch { setOpenShifts([]); }
  }

  async function loadCost() {
    if (!isManager) return;
    try {
      const data = await api(`/api/schedules/cost?month=${period.month}&year=${period.year}${siteQuery}`, { token });
      setCost(data);
    } catch { setCost(null); }
  }

  async function loadAudit() {
    if (!isManager) return;
    try {
      const data = await api(`/api/shifts/audit?limit=30${siteQuery}`, { token });
      setAudit(data.entries || []);
    } catch { setAudit([]); }
  }

  // Download a payroll-ready CSV timesheet (auth header needed → fetch + blob).
  async function downloadTimesheet() {
    try {
      const res = await fetch(`/api/schedules/timesheet?month=${period.month}&year=${period.year}&format=csv${siteQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timesheet_${period.year}-${String(period.month).padStart(2, "0")}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setScheduleMsg("Export failed: " + e.message); }
  }

  async function loadNotifs() {
    try { const d = await api("/api/notifications", { token }); setNotifs(d.notifications || []); setUnread(d.unread || 0); } catch {}
  }
  // Accept/Decline a request straight from the notification bell. `yes` = approve/accept.
  async function actOnNotif(n, yes) {
    const m = n.metadata || {};
    let path, body;
    if (m.kind === "TIMEOFF_REQUEST") { path = `/api/timeoff/${m.id}/respond`; body = { approve: yes }; }
    else if (m.kind === "SWAP_REQUEST") { path = `/api/swaps/${m.id}/respond`; body = { accept: yes }; }
    else return;
    setNotifActed((s) => ({ ...s, [n.id]: "…" }));
    try {
      await api(path, { method: "POST", token, body });
      setNotifActed((s) => ({ ...s, [n.id]: yes ? "Accepted ✓" : "Declined" }));
    } catch (e) {
      const already = /review|resolv|already/i.test(e.message || "");
      setNotifActed((s) => ({ ...s, [n.id]: already ? "Already handled" : (e.message || "Couldn't update") }));
    }
    loadNotifs();
  }
  async function openNotifs() {
    const opening = !showNotifs;
    setShowNotifs(opening);
    if (opening && unread > 0) {
      try { await api("/api/notifications/read-all", { method: "POST", token }); setUnread(0); loadNotifs(); } catch {}
    }
  }
  // Poll for new notifications every 30s.
  useEffect(() => { loadNotifs(); const t = setInterval(loadNotifs, 30000); return () => clearInterval(t); }, []);

  async function loadClock() {
    try { setClock(await api("/api/clock/status", { token })); } catch {}
  }
  async function loadTimecard() {
    try { setTimecard(await api("/api/clock/timecard?days=14", { token })); } catch { setTimecard(null); }
  }
  async function toggleClock() {
    try { await api("/api/clock", { method: "POST", token }); loadClock(); loadTimecard(); } catch {}
  }

  // ── Manager: live attendance + facility timecard approvals ──────────────
  async function loadAttendance() {
    if (!isManager) return;
    try { setAttendance(await api(`/api/clock/attendance${siteId ? `?facilityId=${siteId}` : ""}`, { token })); }
    catch { setAttendance({ onNow: [], totalStaff: 0 }); }
  }
  async function loadFacTimecards() {
    if (!isManager) return;
    try { setFacTimecards(await api(`/api/clock/facility-timecards?days=14${siteId ? `&facilityId=${siteId}` : ""}`, { token })); }
    catch { setFacTimecards({ staff: [], rangeDays: 14 }); }
  }

  // ── Staffing needs (how many of each role per shift) ────────────────────
  async function loadStaffing() {
    if (!isManager) return;
    try { setStaffing((await api(`/api/schedules/requirements?month=${period.month}&year=${period.year}${siteId ? `&facilityId=${siteId}` : ""}`, { token })).requirements || []); }
    catch { setStaffing([]); }
  }

  // ── My Staff (admin): roster metrics + per-person HR documents ──────────
  async function loadRoster() {
    if (!isAdmin) return;
    try { setRoster((await api(`/api/staff/roster?month=${period.month}&year=${period.year}${siteId ? `&facilityId=${siteId}` : ""}`, { token })).staff || []); }
    catch { setRoster([]); }
  }
  function expandStaff(userId) {
    setStaffMsg("");
    if (staffExpanded === userId) { setStaffExpanded(null); setStaffDocs([]); setStaffCerts([]); return; }
    setStaffExpanded(userId); setStaffDocs([]); setStaffCerts([]);
    loadStaffDocs(userId); loadStaffCerts(userId);
  }
  async function loadStaffDocs(userId) {
    try { setStaffDocs((await api(`/api/staff/${userId}/documents`, { token })).documents || []); } catch { setStaffDocs([]); }
  }
  async function loadStaffCerts(userId) {
    try { setStaffCerts((await api(`/api/certifications?userId=${userId}`, { token })).certifications || []); } catch { setStaffCerts([]); }
  }
  async function uploadStaffDocs(userId, fileList) {
    if (!fileList || !fileList.length) return;
    setStaffMsg("Uploading…");
    const fd = new FormData();
    [...fileList].forEach((f) => fd.append("files", f));
    try {
      const res = await fetch(`/api/staff/${userId}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      setStaffMsg(data.message);
      await loadStaffDocs(userId); loadRoster();
    } catch (e) { setStaffMsg(e.message); }
  }
  async function downloadStaffFile(url, filename) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Download failed"); }
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = u; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
    } catch (e) { setStaffMsg(e.message); }
  }
  async function deleteStaffDoc(userId, docId) {
    if (!window.confirm("Delete this document?")) return;
    try { await api(`/api/staff/${userId}/documents/${docId}`, { method: "DELETE", token }); await loadStaffDocs(userId); loadRoster(); }
    catch (e) { setStaffMsg(e.message); }
  }
  const relClass = (label) => label === "Excellent" ? "rel-ok" : label === "Good" ? "rel-good" : label === "Fair" ? "rel-mid" : label === "At risk" ? "rel-bad" : "rel-none";

  // ── Certifications (staff self-service) ─────────────────────────────────
  async function loadCerts() {
    try { setCerts((await api("/api/certifications", { token })).certifications || []); } catch { setCerts([]); }
  }
  async function addCert() {
    setCertMsg("");
    if (!certForm.name.trim()) { setCertMsg("Enter a certification name."); return; }
    try {
      const r = await api("/api/certifications", { method: "POST", token, body: certForm });
      setCertMsg(r.message);
      setCertForm({ name: "", number: "", expiryDate: "" });
      loadCerts();
    } catch (e) { setCertMsg(e.message); }
  }
  async function deleteCert(id) {
    if (!window.confirm("Remove this certification?")) return;
    try { await api(`/api/certifications/${id}`, { method: "DELETE", token }); loadCerts(); }
    catch (e) { setCertMsg(e.message); }
  }
  // My own certification documents (staff-uploaded; only I + my managers can see them).
  async function loadMyDocs() {
    try { setMyDocs((await api("/api/my/documents", { token })).documents || []); } catch { setMyDocs([]); }
  }
  async function uploadMyDocs(fileList) {
    if (!fileList || !fileList.length) return;
    setMyDocMsg("Uploading…");
    const fd = new FormData();
    [...fileList].forEach((f) => fd.append("files", f));
    try {
      const res = await fetch("/api/my/documents", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      setMyDocMsg(data.message); await loadMyDocs();
    } catch (e) { setMyDocMsg(e.message); }
  }
  async function deleteMyDoc(id) {
    if (!window.confirm("Delete this document?")) return;
    try { await api(`/api/my/documents/${id}`, { method: "DELETE", token }); await loadMyDocs(); }
    catch (e) { setMyDocMsg(e.message); }
  }
  // Expiry status for a certification → { label, cls } (drives the colored pill).
  function certStatus(expiryDate) {
    if (!expiryDate) return { label: "No expiry", cls: "rel-none" };
    const days = Math.floor((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: "Expired", cls: "rel-bad" };
    if (days <= 30) return { label: `Expires in ${days}d`, cls: "rel-mid" };
    return { label: "Valid", cls: "rel-ok" };
  }
  const staffingVal = (dateStr, shift, cert) => {
    const row = staffing.find((r) => r.date === dateStr && r.shift === shift && r.certification === cert);
    return row ? row.count : 1;
  };
  function setStaffingCell(dateStr, shift, cert, value) {
    const count = Math.max(0, Math.min(20, Math.round(Number(value) || 0)));
    setStaffing((rows) => {
      const others = rows.filter((r) => !(r.date === dateStr && r.shift === shift && r.certification === cert));
      return [...others, { date: dateStr, shift, certification: cert, count }];
    });
  }
  // Copy one date's 9 values to every date in the month (quick baseline).
  function copyStaffingToAllDays(fromDateStr) {
    setStaffing((rows) => {
      const SH = ["Day", "Evening", "Night"], CE = ["RN", "LPN", "CCA"];
      const at = (s, c) => { const r = rows.find((x) => x.date === fromDateStr && x.shift === s && x.certification === c); return r ? r.count : 1; };
      const next = [];
      for (const { dateStr } of scheduleDates) for (const s of SH) for (const c of CE) next.push({ date: dateStr, shift: s, certification: c, count: at(s, c) });
      return next;
    });
  }
  async function saveStaffing() {
    setStaffingMsg(""); setStaffingBusy(true);
    try {
      const r = await api("/api/schedules/requirements", {
        method: "PUT", token,
        body: { ...(siteId ? { facilityId: siteId } : {}), requirements: staffing },
      });
      setStaffingMsg(r.message);
      loadStaffing();
    } catch (e) { setStaffingMsg(e.message); }
    finally { setStaffingBusy(false); }
  }

  // ── Schedule review: workload preview, admin swap (reassign), post ──────
  async function loadWorkload() {
    if (!isManager) return;
    try { setWorkload(await api(`/api/schedules/workload?month=${period.month}&year=${period.year}${siteQuery}`, { token })); }
    catch { setWorkload({ periodId: null, status: null, staff: [], summary: { min: 0, max: 0, avg: 0, openShifts: 0, totalAssigned: 0 } }); }
  }
  async function postSchedule() {
    if (!schedulePeriod?.id) return;
    if (!window.confirm("Post this schedule? Your staff will see their shifts and get notified.")) return;
    setScheduleMsg("");
    try {
      await api(`/api/schedules/${schedulePeriod.id}/publish`, { method: "PATCH", token });
      setScheduleMsg("Schedule posted — staff notified ✓");
      loadSchedule(); loadWorkload();
    } catch (e) { setScheduleMsg(e.message); }
  }
  async function openReassign(shiftId) {
    setReassignMsg("");
    if (reassignFor === shiftId) { setReassignFor(null); setReassignCands(null); return; }
    setReassignFor(shiftId); setReassignCands(null);
    try { setReassignCands((await api(`/api/shifts/${shiftId}/candidates`, { token })).candidates || []); }
    catch (e) { setReassignMsg(e.message); setReassignCands([]); }
  }
  async function doReassign(shiftId, toStaffId) {
    setReassignMsg("");
    try {
      const r = await api("/api/schedules/reassign", { method: "POST", token, body: { shiftId, toStaffId } });
      setReassignMsg(r.message);
      setReassignFor(null); setReassignCands(null);
      loadSchedule(); loadWorkload();
    } catch (e) { setReassignMsg(e.message); }
  }
  // Calendar drag-and-drop: swap two assigned shifts, or drop someone onto an open
  // slot to fill it (their old slot then opens). Backend enforces cert + 8h rest.
  async function moveShift(sourceShiftId, targetShiftId) {
    if (!sourceShiftId || !targetShiftId || sourceShiftId === targetShiftId) return;
    setScheduleMsg("");
    try {
      const r = await api("/api/schedules/move", { method: "POST", token, body: { sourceShiftId, targetShiftId } });
      setScheduleMsg(r.message);
      await loadSchedule(); loadWorkload(); loadCost();
    } catch (e) { setScheduleMsg(e.message); }
  }
  function onChipDragStart(e, shift) {
    if (!shift.staffId) { e.preventDefault(); return; } // only assigned chips can be dragged
    setDragId(shift.id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", shift.id); } catch {}
  }
  function onChipDrop(e, targetShift) {
    e.preventDefault();
    const src = dragId || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
    setDropId(null); setDragId(null);
    if (src && targetShift?.id && src !== targetShift.id) moveShift(src, targetShift.id);
  }
  async function approveDay(userId, date) {
    setTcMsg("");
    try { const r = await api("/api/clock/approve", { method: "POST", token, body: { userId, date } }); setTcMsg(r.message); loadFacTimecards(); }
    catch (e) { setTcMsg(e.message); }
  }
  async function reopenDay(userId, date) {
    setTcMsg("");
    try { const r = await api("/api/clock/unapprove", { method: "POST", token, body: { userId, date } }); setTcMsg(r.message); loadFacTimecards(); }
    catch (e) { setTcMsg(e.message); }
  }
  async function correctPunch(userId) {
    setTcMsg("");
    if (!fixTime) { setTcMsg("Pick the missing clock-out date & time first."); return; }
    try {
      const r = await api("/api/clock/correct", { method: "POST", token, body: { userId, timestamp: new Date(fixTime).toISOString(), event: "CLOCK_OUT" } });
      setTcMsg(r.message); setFixFor(null); setFixTime(""); loadFacTimecards();
    } catch (e) { setTcMsg(e.message); }
  }

  // Permanently delete the signed-in user's account (Apple 5.1.1(v) / Play).
  async function deleteAccount() {
    if (!window.confirm("Delete your account?\n\nYour name, email and phone number will be erased and you'll be signed out. This can't be undone.")) return;
    try {
      await api("/api/account/delete", { method: "POST", token });
      window.alert("Your account and personal details have been deleted.");
      onLogout();
    } catch (e) { window.alert("Couldn't delete your account: " + e.message); }
  }

  async function loadAvailability() {
    try { setAvailability((await api("/api/availability", { token })).blocks || []); } catch { setAvailability([]); }
  }
  const isBlocked = (dow, shift) => availability.some((b) => b.dayOfWeek === dow && b.shift === shift);
  async function toggleAvail(dow, shift) {
    const off = isBlocked(dow, shift);
    try { await api("/api/availability", { method: "POST", token, body: { dayOfWeek: dow, shift, available: off } }); loadAvailability(); }
    catch (e) { setToMsg(e.message); }
  }

  async function loadTimeoff() {
    try {
      const d = await api(`/api/timeoff${isManager && siteId ? `?facilityId=${siteId}` : ""}`, { token });
      setTimeoff(d.requests || []);
    } catch { setTimeoff([]); }
  }
  async function submitTimeoff() {
    setToMsg("");
    if (!toForm.startDate || !toForm.endDate) { setToMsg("Pick a start and end date."); return; }
    try {
      const r = await api("/api/timeoff", { method: "POST", token, body: toForm });
      setToMsg(r.message);
      setToForm({ startDate: "", endDate: "", type: "VACATION", reason: "" });
      loadTimeoff();
    } catch (e) { setToMsg(e.message); }
  }
  async function respondTimeoff(id, approve) {
    setToMsg("");
    try {
      const r = await api(`/api/timeoff/${id}/respond`, { method: "POST", token, body: { approve } });
      setToMsg(r.message);
      loadTimeoff();
    } catch (e) { setToMsg(e.message); }
  }

  async function loadSwaps() {
    try {
      const data = await api(`/api/swaps`, { token });
      setSwaps({ incoming: data.incoming || [], outgoing: data.outgoing || [] });
    } catch { setSwaps({ incoming: [], outgoing: [] }); }
  }

  async function openTrade(shiftId) {
    setTradeMsg("");
    if (tradeFor === shiftId) { setTradeFor(null); setTradeOpts(null); return; }
    setTradeFor(shiftId); setTradeOpts(null);
    try {
      const data = await api(`/api/swaps/coworkers?shiftId=${shiftId}`, { token });
      setTradeOpts(data);
    } catch (e) { setTradeMsg(e.message); }
  }

  async function proposeTrade(offeredShiftId) {
    setTradeMsg("");
    try {
      const r = await api(`/api/swaps`, { method: "POST", token, body: { originalShiftId: tradeFor, offeredShiftId } });
      setTradeMsg(r.message);
      setTradeFor(null); setTradeOpts(null);
      loadSwaps();
    } catch (e) { setTradeMsg(e.message); }
  }

  async function respondSwap(id, accept) {
    setTradeMsg("");
    try {
      const r = await api(`/api/swaps/${id}/respond`, { method: "POST", token, body: { accept } });
      setTradeMsg(r.message);
      loadSwaps(); loadSchedule();
    } catch (e) { setTradeMsg(e.message); }
  }

  // Staff calls in sick / drops one of their shifts → posts to open board.
  async function releaseShift(shiftId, reason) {
    setScheduleMsg("");
    try {
      const r = await api(`/api/shifts/${shiftId}/release`, { method: "POST", token, body: { reason } });
      setScheduleMsg(r.message);
      loadSchedule(); loadOpen(); loadCost();
    } catch (e) { setScheduleMsg(e.message); }
  }

  async function viewCandidates(shiftId) {
    if (expanded === shiftId) { setExpanded(null); return; }
    setExpanded(shiftId); setCandidates([]);
    try {
      const data = await api(`/api/shifts/${shiftId}/candidates`, { token });
      setCandidates(data.candidates || []);
    } catch (e) { setOpenMsg(e.message); }
  }

  async function fillShift(shiftId, staffId) {
    setOpenMsg("");
    try {
      await api(`/api/shifts/${shiftId}/assign`, { method: "POST", token, body: { staffId } });
      setOpenShifts((list) => list.filter((s) => s.id !== shiftId));
      setExpanded(null);
      setOpenMsg("Shift filled ✓");
      loadSchedule();
    } catch (e) { setOpenMsg(e.message); }
  }

  async function acceptShift(shiftId) {
    setOpenMsg("");
    try {
      await api(`/api/shifts/${shiftId}/accept`, { method: "POST", token });
      setOpenShifts((list) => list.filter((s) => s.id !== shiftId));
      setOpenMsg("You accepted the shift ✓");
      loadSchedule();
    } catch (e) { setOpenMsg(e.message); }
  }

  // Load sites once (admins get all, others get their own)
  useEffect(() => {
    api("/api/users/me", { token }).then((d) => setMe(d.user)).catch(() => {});
    api("/api/facilities", { token })
      .then((d) => {
        setSites(d.facilities || []);
        if (d.facilities?.length) setSiteId(d.facilities[0].id);
      })
      .catch(() => {});
  }, []);

  // Reload team + schedule whenever site or month changes
  useEffect(() => {
    if (!siteId && sites.length) return; // wait until a site is chosen
    loadTeam();
    loadSchedule();
    loadOpen();
    loadCost();
    loadAudit();
    loadSwaps();
    loadTimeoff();
    loadAvailability();
    loadClock();
    loadTimecard();
    loadAttendance();
    loadFacTimecards();
    loadStaffing();
    loadWorkload();
    loadRoster();
    loadCerts();
    loadMyDocs();
  }, [siteId, period.month, period.year]);

  // Default the generate date-range to the whole month whenever the month changes.
  useEffect(() => {
    const p2 = (n) => String(n).padStart(2, "0");
    setSchedRange({
      start: `${period.year}-${p2(period.month)}-01`,
      end: `${period.year}-${p2(period.month)}-${p2(new Date(period.year, period.month, 0).getDate())}`,
    });
  }, [period.month, period.year]);

  // Keep the live attendance view fresh while it's open (poll every 20s).
  useEffect(() => {
    if (view !== "attendance" || !isManager) return;
    loadAttendance();
    const t = setInterval(loadAttendance, 20000);
    return () => clearInterval(t);
  }, [view, siteId]);

  async function generate() {
    if (schedulePeriod?.status === "PUBLISHED" &&
        !window.confirm("This replaces the posted schedule with a brand-new draft (staff won't see it until you Post again). Continue?")) return;
    setBusy(true);
    setScheduleMsg("");
    try {
      const res = await api("/api/schedules/generate", {
        method: "POST", token,
        body: {
          month: period.month, year: period.year,
          ...(siteId ? { facilityId: siteId } : {}),
          ...(schedRange.start ? { startDate: schedRange.start } : {}),
          ...(schedRange.end ? { endDate: schedRange.end } : {}),
        },
      });
      await loadSchedule();
      loadWorkload();
      const warn = res.warnings?.length || 0;
      setScheduleMsg(`Generated ${res.shiftsCreated} shifts ✓${warn ? ` · ${warn} coverage gaps (add more staff)` : " · full coverage"} · review below, then Post`);
    } catch (err) {
      setScheduleMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const currentSite = sites.find((s) => s.id === siteId);
  const pad2 = (n) => String(n).padStart(2, "0");
  const monthFirst = `${period.year}-${pad2(period.month)}-01`;
  const monthLast = `${period.year}-${pad2(period.month)}-${pad2(new Date(period.year, period.month, 0).getDate())}`;
  // Every calendar date in the displayed month — drives the per-date staffing grid.
  const scheduleDates = (() => {
    const out = [];
    const start = new Date(monthFirst + "T00:00:00");
    const end = new Date(monthLast + "T00:00:00");
    if (isNaN(+start) || isNaN(+end)) return out;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      out.push({ dateStr, label: `${WEEKDAY_FULL[d.getDay()]} · ${d.toLocaleString(undefined, { month: "short" })} ${d.getDate()}` });
    }
    return out;
  })();

  // Everything the screens need, in one bag — see screens/*.jsx.
  const ctx = {
    token, user, isManager, isAdmin, me,
    sites, siteId, setSiteId, currentSite, period, monthName, shiftMonth,
    monthFirst, monthLast, scheduleDates,
    team, schedule, schedulePeriod, scheduleMsg, busy, generate, postSchedule,
    cost, downloadTimesheet, audit,
    openShifts, expanded, candidates, openMsg, viewCandidates, fillShift, acceptShift,
    notifs, unread, showNotifs, openNotifs, notifActed, actOnNotif,
    view, setView,
    clock, toggleClock, timecard,
    attendance, loadAttendance, facTimecards, tcMsg, setTcMsg,
    approveDay, reopenDay, fixFor, setFixFor, fixTime, setFixTime, correctPunch,
    staffingVal, setStaffingCell, copyStaffingToAllDays, saveStaffing, staffingBusy, staffingMsg,
    schedRange, setSchedRange,
    workload, reassignFor, reassignCands, reassignMsg, openReassign, doReassign,
    calView, setCalView, calWeek, setCalWeek,
    dragId, setDragId, dropId, setDropId, onChipDragStart, onChipDrop,
    roster, expandStaff, staffExpanded, staffDocs, staffCerts, staffMsg, relClass,
    uploadStaffDocs, downloadStaffFile, deleteStaffDoc,
    certs, certForm, setCertForm, certMsg, addCert, deleteCert, certStatus,
    myDocs, myDocMsg, uploadMyDocs, deleteMyDoc,
    isBlocked, toggleAvail,
    timeoff, toForm, setToForm, toMsg, submitTimeoff, respondTimeoff,
    swaps, tradeFor, tradeOpts, tradeMsg, openTrade, proposeTrade, respondSwap,
    releaseShift, deleteAccount,
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <strong>Mirai</strong>
          {me?.facility && <span className="facility">· {me.facility.name}</span>}
        </div>
        <div className="user-chip">
          <RoleBadge value={user.role} />
          <span>{user.firstName} {user.lastName}</span>
          <NotifBell ctx={ctx} />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button className="btn-ghost" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="grid">
        {view !== "home" && (
          <section className="card span2" style={{ display: "flex", alignItems: "center", padding: "14px 24px" }}>
            <button className="btn-ghost" onClick={() => setView(view === "myspace" ? "home" : "myspace")}>‹ Back</button>
          </section>
        )}
        {view === "myspace" && <MySpaceView ctx={ctx} />}
        {view === "home" && <HomeView ctx={ctx} />}
        {view === "timeoff" && !isManager && <TimeoffView ctx={ctx} />}
        {view === "availability" && !isManager && <AvailabilityView ctx={ctx} />}
        {view === "approvals" && isManager && <ApprovalsView ctx={ctx} />}
        {view === "attendance" && isManager && <AttendanceView ctx={ctx} />}
        {view === "factimecards" && isManager && <TimecardsView ctx={ctx} />}
        {view === "timecard" && !isManager && <MyTimecardView ctx={ctx} />}
        {view === "certs" && !isManager && <CertsView ctx={ctx} />}
        {view === "scheduling" && isManager && <SchedulingView ctx={ctx} />}
        {view === "mystaff" && isAdmin && <MyStaffView ctx={ctx} />}
      </main>

      <nav className="bottom-bar">
        <button className={"bottom-item" + (view === "home" ? " active" : "")} onClick={() => { setView("home"); setMoreOpen(false); }}>Home</button>
        <button className={"bottom-item" + (view !== "home" ? " active" : "")} onClick={() => setView("myspace")}>My Space</button>
      </nav>
    </div>
  );
}

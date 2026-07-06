import React, { useState, useEffect, useRef } from "react";
import { SafeAreaView, View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { API, api } from "../api";
import { C, styles } from "../theme";
import { ThemeToggle } from "../ui";
import { HomeView } from "./HomeView";
import { MySpaceView } from "./MySpaceView";
import { TimeoffView } from "./TimeoffView";
import { ApprovalsView } from "./ApprovalsView";
import { AvailabilityView } from "./AvailabilityView";
import { MyTimecardView } from "./MyTimecardView";
import { CertsView } from "./CertsView";
import { MyStaffView } from "./MyStaffView";
import { AttendanceView } from "./AttendanceView";
import { SchedulingView } from "./SchedulingView";
import { TimecardsView } from "./TimecardsView";

// Owns ALL the signed-in state (data + actions) and the page shell; each screen
// receives everything through the single `ctx` object built at the bottom.
export function DashboardScreen({ token, user, onLogout, theme, onToggleTheme }) {
  const [me, setMe] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [open, setOpen] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [tradeFor, setTradeFor] = useState(null);
  const [tradeOpts, setTradeOpts] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [timeoff, setTimeoff] = useState([]);
  const [toStart, setToStart] = useState("");
  const [toEnd, setToEnd] = useState("");
  const [toType, setToType] = useState("VACATION");
  const [toReason, setToReason] = useState("");
  const [pickerFor, setPickerFor] = useState(null); // 'start' | 'end' | null
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifActed, setNotifActed] = useState({}); // notifId -> result label after Accept/Decline
  const [view, setView] = useState("home");
  const [moreOpen, setMoreOpen] = useState(false);
  const [clock, setClock] = useState({ clockedIn: false, since: null, todayMinutes: 0 });
  const [timecard, setTimecard] = useState(null);
  // Admin: multi-site + My Staff + live attendance
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const [roster, setRoster] = useState([]);
  const [staffSel, setStaffSel] = useState(null);      // expanded staff userId in My Staff
  const [attendance, setAttendance] = useState({ onNow: [], totalStaff: 0 });
  // Staffing & schedule (manager/admin)
  const [staffing, setStaffing] = useState([]);        // [{shift,certification,count}]
  const [schedRange, setSchedRange] = useState(() => { const n = new Date(), m = n.getMonth() + 1, y = n.getFullYear(), p = (x) => String(x).padStart(2, "0"); return { start: `${y}-${p(m)}-01`, end: `${y}-${p(m)}-${p(new Date(y, m, 0).getDate())}` }; });
  const [schedPickerFor, setSchedPickerFor] = useState(null); // 'start' | 'end'
  const [workload, setWorkload] = useState({ periodId: null, status: null, staff: [], summary: { min: 0, max: 0, openShifts: 0, totalAssigned: 0 } });
  const [reassignFor, setReassignFor] = useState(null);
  const [reassignCands, setReassignCands] = useState(null);
  // Timecards (manager/admin)
  const [facTimecards, setFacTimecards] = useState({ staff: [], rangeDays: 14 });
  const [tcSel, setTcSel] = useState(null);            // expanded staff in Timecards
  const [fixingDay, setFixingDay] = useState(null);    // { userId, date } for missed-punch clock-out
  const [staffDocs, setStaffDocs] = useState([]);      // documents for the expanded My Staff person
  const [docMsg, setDocMsg] = useState("");
  // Certifications
  const [certs, setCerts] = useState([]);              // my own certifications (staff)
  const [certForm, setCertForm] = useState({ name: "", number: "", expiryDate: "" });
  const [certExpPicker, setCertExpPicker] = useState(false);
  const [staffCerts, setStaffCerts] = useState([]);    // certs of the expanded My Staff person (admin)
  const [myDocs, setMyDocs] = useState([]);            // my own certification documents (staff)

  const now = new Date();
  // Viewed month — flips with the ‹ › month switcher (defaults to the current month).
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const month = period.month;
  const year = period.year;
  const monthName = new Date(year, month - 1, 1).toLocaleString("default", { month: "long" });
  const shiftMonth = (delta) => setPeriod((p) => { const d = new Date(p.year, p.month - 1 + delta, 1); return { month: d.getMonth() + 1, year: d.getFullYear() }; });
  const isManager = user.role === "ADMIN" || user.role === "MANAGER";
  const isAdmin = user.role === "ADMIN";
  const myCert = me?.certification;
  const siteQ = isAdmin && siteId ? `&facilityId=${siteId}` : "";
  const money = (n) => "$" + Math.round(n || 0);
  const relColor = (label) => label === "Excellent" ? C.success : label === "Good" ? C.accent : label === "Fair" ? C.warning : label === "At risk" ? C.error : C.text2;
  const pad2 = (n) => String(n).padStart(2, "0");
  const currentSiteName = sites.find((s) => s.id === siteId)?.name;
  // ‹ Month Year › navigator, shown on every month-scoped view.
  const monthNav = (
    <View style={styles.monthNav}>
      <TouchableOpacity style={[styles.monthNavBtn, busy && { opacity: 0.4 }]} disabled={busy} onPress={() => shiftMonth(-1)}><Ionicons name="chevron-back" size={18} color={C.text2} /></TouchableOpacity>
      <Text style={styles.monthNavLabel}>{monthName} {year}</Text>
      <TouchableOpacity style={[styles.monthNavBtn, busy && { opacity: 0.4 }]} disabled={busy} onPress={() => shiftMonth(1)}><Ionicons name="chevron-forward" size={18} color={C.text2} /></TouchableOpacity>
    </View>
  );
  // Reusable site switcher (admin) — chips to jump between facilities, usable on
  // any admin screen. Renders null for non-admins / single-site.
  const siteSwitcher = isAdmin && sites.length > 0 ? (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {sites.map((st) => (
        <TouchableOpacity key={st.id} style={[styles.siteChip, siteId === st.id && styles.siteChipOn]} onPress={() => setSiteId(st.id)}>
          <Text style={[styles.siteChipText, siteId === st.id && styles.siteChipTextOn]}>{st.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  ) : null;
  const certStatus = (expiryDate) => {
    if (!expiryDate) return { label: "No expiry", color: C.text2 };
    const days = Math.floor((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: "Expired", color: C.error };
    if (days <= 30) return { label: `Expires in ${days}d`, color: C.warning };
    return { label: "Valid", color: C.success };
  };
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  // Every calendar date in the current month — drives the per-date staffing grid.
  const scheduleDates = (() => {
    const pad = (x) => String(x).padStart(2, "0");
    const last = new Date(year, month, 0).getDate(); // last day of the (1-based) month
    const out = [];
    for (let day = 1; day <= last; day++) {
      const d = new Date(year, month - 1, day);
      out.push({ dateStr: `${year}-${pad(month)}-${pad(day)}`, label: `${WEEKDAY_FULL[d.getDay()]} · ${MONTHS_SHORT[month - 1]} ${day}` });
    }
    return out;
  })();
  const staffingVal = (dateStr, shift, cert) => { const r = staffing.find((x) => x.date === dateStr && x.shift === shift && x.certification === cert); return r ? String(r.count) : "1"; };
  const setStaffingCell = (dateStr, shift, cert, v) => { const count = Math.max(0, Math.min(20, parseInt(v, 10) || 0)); setStaffing((rows) => [...rows.filter((x) => !(x.date === dateStr && x.shift === shift && x.certification === cert)), { date: dateStr, shift, certification: cert, count }]); };
  const copyStaffingToAllDays = (fromDateStr) => setStaffing((rows) => { const SH = ["Day", "Evening", "Night"], CE = ["RN", "LPN", "CCA"]; const at = (s, c) => { const r = rows.find((x) => x.date === fromDateStr && x.shift === s && x.certification === c); return r ? r.count : 1; }; const out = []; for (const { dateStr } of scheduleDates) for (const s of SH) for (const c of CE) out.push({ date: dateStr, shift: s, certification: c, count: at(s, c) }); return out; });
  // One-tap "no staff needed this day" — zero out all 9 cells of one date.
  const zeroDay = (dateStr) => setStaffing((rows) => { const SH = ["Day", "Evening", "Night"], CE = ["RN", "LPN", "CCA"]; const out = rows.filter((x) => x.date !== dateStr); for (const s of SH) for (const c of CE) out.push({ date: dateStr, shift: s, certification: c, count: 0 }); return out; });

  // Guard against out-of-order responses: each load run remembers the
  // site+month it started for and only writes state if the user is still
  // viewing that combination when the response arrives.
  const viewKeyRef = useRef("");
  viewKeyRef.current = `${siteId}|${month}|${year}`;

  // Data that doesn't depend on the viewed month (profile, inbox, clock, …) —
  // reloaded on sign-in / site change / after actions, NOT on month flips.
  async function loadSessionData() {
    try { setMe((await api("/api/users/me", { token })).user); } catch {}
    try { setIncoming((await api("/api/swaps", { token })).incoming || []); } catch { setIncoming([]); }
    try { setTimeoff((await api(`/api/timeoff${isManager && siteId && isAdmin ? `?facilityId=${siteId}` : ""}`, { token })).requests || []); } catch { setTimeoff([]); }
    try { setAvailability((await api("/api/availability", { token })).blocks || []); } catch { setAvailability([]); }
    try { const n = await api("/api/notifications", { token }); setNotifs(n.notifications || []); setUnread(n.unread || 0); } catch {}
    try { setClock(await api("/api/clock/status", { token })); } catch {}
    try { setTimecard(await api("/api/clock/timecard?days=14", { token })); } catch { setTimecard(null); }
    try { setCerts((await api("/api/certifications", { token })).certifications || []); } catch { setCerts([]); }
    await loadMyDocs();
    if (isManager) { try { setAttendance(await api(`/api/clock/attendance${siteId && isAdmin ? `?facilityId=${siteId}` : ""}`, { token })); } catch { setAttendance({ onNow: [], totalStaff: 0 }); } }
    if (isManager) { try { setFacTimecards(await api(`/api/clock/facility-timecards?days=14${siteQ}`, { token })); } catch { setFacTimecards({ staff: [], rangeDays: 14 }); } }
  }
  // Month-scoped data. Every write checks the guard so a slow response for a
  // month the user already flipped away from can never overwrite the new one.
  async function loadMonthData() {
    const key = `${siteId}|${month}|${year}`;
    const fresh = () => viewKeyRef.current === key;
    try { const v = (await api(`/api/schedules?month=${month}&year=${year}${siteQ}`, { token })).shifts || []; if (fresh()) setShifts(v); } catch { if (fresh()) setShifts([]); }
    try { const v = (await api(`/api/shifts/open?month=${month}&year=${year}${siteQ}`, { token })).openShifts || []; if (fresh()) setOpen(v); } catch { if (fresh()) setOpen([]); }
    if (isAdmin) { try { const v = (await api(`/api/staff/roster?month=${month}&year=${year}${siteQ}`, { token })).staff || []; if (fresh()) setRoster(v); } catch { if (fresh()) setRoster([]); } }
    if (isManager) { try { const v = await api(`/api/schedules/workload?month=${month}&year=${year}${siteQ}`, { token }); if (fresh()) setWorkload(v); } catch { if (fresh()) setWorkload({ periodId: null, status: null, staff: [], summary: { min: 0, max: 0, openShifts: 0, totalAssigned: 0 } }); } }
  }
  async function loadStaffing() {
    if (!isManager) return;
    const key = `${siteId}|${month}|${year}`;
    const fresh = () => viewKeyRef.current === key;
    try { const v = (await api(`/api/schedules/requirements?month=${month}&year=${year}${isAdmin && siteId ? `&facilityId=${siteId}` : ""}`, { token })).requirements || []; if (fresh()) setStaffing(v); } catch { if (fresh()) setStaffing([]); }
  }
  async function loadAll() {
    await loadMonthData();
    await loadStaffing();
    await loadSessionData();
  }
  // When the viewed month changes, snap the schedule date range to that month.
  useEffect(() => {
    const p = (x) => String(x).padStart(2, "0");
    setSchedRange({ start: `${year}-${p(month)}-01`, end: `${year}-${p(month)}-${p(new Date(year, month, 0).getDate())}` });
  }, [month, year]);
  // Load sites once (admin), then (re)load everything whenever the site changes.
  useEffect(() => {
    if (!isAdmin) return;
    api("/api/facilities", { token }).then((d) => { setSites(d.facilities || []); if (d.facilities?.length && !siteId) setSiteId(d.facilities[0].id); }).catch(() => {});
  }, []);
  useEffect(() => { loadSessionData(); }, [siteId]);
  useEffect(() => {
    // Clear month-scoped data immediately so the previous month can never
    // linger under the new month's header, then fetch the new month.
    setShifts([]); setOpen([]); setRoster([]);
    setWorkload({ periodId: null, status: null, staff: [], summary: { min: 0, max: 0, openShifts: 0, totalAssigned: 0 } });
    setStaffing([]);
    loadMonthData(); loadStaffing();
  }, [siteId, month, year]);
  const toggleClock = () => act(() => api("/api/clock", { method: "POST", token }), null);
  // Poll for new notifications every 30s.
  useEffect(() => {
    const t = setInterval(async () => {
      try { const n = await api("/api/notifications", { token }); setNotifs(n.notifications || []); setUnread(n.unread || 0); } catch {}
    }, 30000);
    return () => clearInterval(t);
  }, []);
  async function openNotifs() {
    const opening = !showNotifs;
    setShowNotifs(opening);
    if (opening && unread > 0) { try { await api("/api/notifications/read-all", { method: "POST", token }); setUnread(0); } catch {} }
  }

  const isBlocked = (dow, shift) => availability.some((b) => b.dayOfWeek === dow && b.shift === shift);
  async function toggleAvail(dow, shift) {
    const off = isBlocked(dow, shift);
    try {
      await api("/api/availability", { method: "POST", token, body: { dayOfWeek: dow, shift, available: off } });
      setAvailability((await api("/api/availability", { token })).blocks || []);
    } catch (e) { setMsg(e.message); }
  }

  const grabbable = open.filter((s) => isManager || !myCert || s.requiredCertification === myCert);

  async function act(fn, okMsg) {
    setBusy(true); setMsg("");
    try { await fn(); await loadAll(); setMsg(okMsg); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  const generate = () => act(() => api("/api/schedules/generate", { method: "POST", token, body: { month, year } }), "Schedule generated.");
  const accept = (id) => act(() => api(`/api/shifts/${id}/accept`, { method: "POST", token }), "Shift accepted.");
  const callSick = (id) => act(() => api(`/api/shifts/${id}/release`, { method: "POST", token, body: { reason: "SICK" } }), "Called in sick — posted for cover.");
  const drop = (id) => act(() => api(`/api/shifts/${id}/release`, { method: "POST", token, body: { reason: "SWAP" } }), "Shift dropped to the board.");
  const respond = (id, accept) => act(() => api(`/api/swaps/${id}/respond`, { method: "POST", token, body: { accept } }), accept ? "Shifts traded." : "Trade declined.");
  const submitTimeoff = () => act(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toStart) || !/^\d{4}-\d{2}-\d{2}$/.test(toEnd)) throw new Error("Enter dates as YYYY-MM-DD");
    await api("/api/timeoff", { method: "POST", token, body: { startDate: toStart, endDate: toEnd, type: toType, reason: toReason } });
    setToStart(""); setToEnd(""); setToReason("");
  }, "Time-off request submitted.");
  const respondTimeoff = (id, approve) => act(() => api(`/api/timeoff/${id}/respond`, { method: "POST", token, body: { approve } }), approve ? "Leave approved." : "Leave denied.");
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
    loadAll();
  }

  // Permanently delete the signed-in user's account (Apple 5.1.1(v) / Play).
  function deleteAccount() {
    Alert.alert(
      "Delete account",
      "Your name, email and phone number will be erased and you'll be signed out. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          try {
            await api("/api/account/delete", { method: "POST", token });
            Alert.alert("Account deleted", "Your account and personal details have been deleted.");
            onLogout();
          } catch (e) { Alert.alert("Couldn't delete account", e.message); }
        } },
      ],
    );
  }
  function onPickDate(event, selected) {
    const which = pickerFor;
    setPickerFor(null); // Android closes the dialog after a pick
    if (event.type === "dismissed" || !selected) return;
    const str = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`;
    if (which === "start") setToStart(str); else setToEnd(str);
  }

  async function openTrade(shiftId) {
    setMsg("");
    if (tradeFor === shiftId) { setTradeFor(null); setTradeOpts(null); return; }
    setTradeFor(shiftId); setTradeOpts(null);
    try { setTradeOpts(await api(`/api/swaps/coworkers?shiftId=${shiftId}`, { token })); } catch (e) { setMsg(e.message); }
  }
  const proposeTrade = (offeredShiftId) => act(async () => {
    await api("/api/swaps", { method: "POST", token, body: { originalShiftId: tradeFor, offeredShiftId } });
    setTradeFor(null); setTradeOpts(null);
  }, "Trade request sent.");

  // ── Staffing & schedule actions (manager/admin) ────────────────────────
  const saveStaffing = () => act(async () => {
    await api("/api/schedules/requirements", { method: "PUT", token, body: { ...(isAdmin && siteId ? { facilityId: siteId } : {}), requirements: staffing } });
  }, "Staffing needs saved.");
  const generateRange = () => act(async () => {
    await api("/api/schedules/generate", { method: "POST", token, body: { month, year, ...(isAdmin && siteId ? { facilityId: siteId } : {}), startDate: schedRange.start, endDate: schedRange.end } });
  }, "Schedule generated — review below, then Post.");
  const postSchedule = () => {
    if (!workload.periodId) { setMsg("Generate a schedule first."); return; }
    act(async () => { await api(`/api/schedules/${workload.periodId}/publish`, { method: "PATCH", token }); }, "Schedule posted — staff notified.");
  };
  const doReassign = (shiftId, toStaffId) => act(async () => {
    await api("/api/schedules/reassign", { method: "POST", token, body: { shiftId, toStaffId } });
    setReassignFor(null); setReassignCands(null);
  }, "Shift reassigned.");
  async function openReassign(shiftId) {
    setMsg("");
    if (reassignFor === shiftId) { setReassignFor(null); setReassignCands(null); return; }
    setReassignFor(shiftId); setReassignCands(null);
    try { setReassignCands((await api(`/api/shifts/${shiftId}/candidates`, { token })).candidates || []); } catch { setReassignCands([]); }
  }
  function onSchedPick(event, selected) {
    const which = schedPickerFor;
    setSchedPickerFor(null);
    if (event.type === "dismissed" || !selected) return;
    const str = `${selected.getFullYear()}-${pad2(selected.getMonth() + 1)}-${pad2(selected.getDate())}`;
    setSchedRange((r) => which === "start" ? { ...r, start: str } : { ...r, end: str });
  }

  // ── Timecards actions (manager/admin) ──────────────────────────────────
  const approveDay = (userId, date) => act(() => api("/api/clock/approve", { method: "POST", token, body: { userId, date } }), "Day approved.");
  const reopenDay = (userId, date) => act(() => api("/api/clock/unapprove", { method: "POST", token, body: { userId, date } }), "Day reopened.");
  function onFixTime(event, selected) {
    const fd = fixingDay;
    setFixingDay(null);
    if (event.type === "dismissed" || !selected || !fd) return;
    const d = new Date(fd.date + "T00:00:00");
    d.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    act(() => api("/api/clock/correct", { method: "POST", token, body: { userId: fd.userId, timestamp: d.toISOString(), event: "CLOCK_OUT" } }), "Clock-out added.");
  }

  // ── My Staff documents (PDF upload / download / delete) ────────────────
  async function loadStaffDocs(userId) {
    try { setStaffDocs((await api(`/api/staff/${userId}/documents`, { token })).documents || []); } catch { setStaffDocs([]); }
  }
  async function uploadDocs(userId) {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", multiple: true, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      setDocMsg("Uploading…");
      const fd = new FormData();
      res.assets.forEach((a) => fd.append("files", { uri: a.uri, name: a.name || "document.pdf", type: a.mimeType || "application/pdf" }));
      const r = await fetch(`${API}/api/staff/${userId}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Upload failed");
      setDocMsg(data.message);
      await loadStaffDocs(userId); loadAll();
    } catch (e) { setDocMsg(e.message); }
  }
  async function downloadFile(url, name) {
    try {
      setDocMsg("Preparing…");
      const fileUri = FileSystem.cacheDirectory + name.replace(/[^\w.\- ]/g, "_");
      const dl = await FileSystem.downloadAsync(url, fileUri, { headers: { Authorization: `Bearer ${token}` } });
      if (dl.status !== 200) throw new Error("Nothing to download");
      setDocMsg("");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(dl.uri, { mimeType: "application/pdf", dialogTitle: "Staff document" });
      else setDocMsg("Saved to " + dl.uri);
    } catch (e) { setDocMsg(e.message); }
  }
  function deleteDoc(userId, docId) {
    Alert.alert("Delete document?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api(`/api/staff/${userId}/documents/${docId}`, { method: "DELETE", token }); await loadStaffDocs(userId); loadAll(); } catch (e) { setDocMsg(e.message); } } },
    ]);
  }

  // ── Certifications ─────────────────────────────────────────────────────
  const loadStaffCerts = async (userId) => { try { setStaffCerts((await api(`/api/certifications?userId=${userId}`, { token })).certifications || []); } catch { setStaffCerts([]); } };
  const addCert = () => { if (!certForm.name.trim()) { setMsg("Enter a certification name."); return; } act(async () => { await api("/api/certifications", { method: "POST", token, body: certForm }); setCertForm({ name: "", number: "", expiryDate: "" }); }, "Certification added."); };
  const deleteCert = (id) => act(() => api(`/api/certifications/${id}`, { method: "DELETE", token }), "Certification removed.");

  // ── My certification documents (staff self-service; only I + my managers see them) ──
  async function loadMyDocs() {
    try { setMyDocs((await api("/api/my/documents", { token })).documents || []); } catch { setMyDocs([]); }
  }
  async function uploadMyDocs() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", multiple: true, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      setDocMsg("Uploading…");
      const fd = new FormData();
      res.assets.forEach((a) => fd.append("files", { uri: a.uri, name: a.name || "document.pdf", type: a.mimeType || "application/pdf" }));
      const r = await fetch(`${API}/api/my/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Upload failed");
      setDocMsg(data.message);
      await loadMyDocs();
    } catch (e) { setDocMsg(e.message); }
  }
  function deleteMyDoc(docId) {
    Alert.alert("Delete document?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api(`/api/my/documents/${docId}`, { method: "DELETE", token }); await loadMyDocs(); } catch (e) { setDocMsg(e.message); } } },
    ]);
  }
  function onCertExpPick(event, selected) {
    setCertExpPicker(false);
    if (event.type === "dismissed" || !selected) return;
    setCertForm((f) => ({ ...f, expiryDate: `${selected.getFullYear()}-${pad2(selected.getMonth() + 1)}-${pad2(selected.getDate())}` }));
  }

  // Everything the screens need, in one bag — see the other files in screens/.
  const ctx = {
    token, user, me, isManager, isAdmin, myCert, busy, msg, view, setView,
    sites, siteId, setSiteId, siteSwitcher, monthNav, monthName, currentSiteName,
    clock, toggleClock, timecard,
    incoming, respond, grabbable, accept, shifts,
    openTrade, tradeFor, tradeOpts, proposeTrade, drop, callSick,
    toStart, toEnd, pickerFor, setPickerFor, onPickDate, toType, setToType,
    toReason, setToReason, submitTimeoff, timeoff, respondTimeoff,
    isBlocked, toggleAvail,
    certForm, setCertForm, certExpPicker, setCertExpPicker, onCertExpPick,
    addCert, certs, certStatus, deleteCert,
    myDocs, downloadFile, deleteMyDoc, uploadMyDocs, docMsg, setDocMsg,
    roster, staffSel, setStaffSel, loadStaffDocs, loadStaffCerts, money, relColor,
    staffDocs, staffCerts, deleteDoc, uploadDocs,
    attendance,
    schedRange, schedPickerFor, setSchedPickerFor, onSchedPick, scheduleDates,
    copyStaffingToAllDays, zeroDay, staffingVal, setStaffingCell, saveStaffing, generateRange,
    workload, postSchedule, openReassign, reassignFor, reassignCands, doReassign,
    facTimecards, tcSel, setTcSel, reopenDay, approveDay, setFixingDay, fixingDay, onFixTime,
    deleteAccount, generate,
  };

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <View style={styles.markSm}><Text style={styles.markTextSm}>M</Text></View>
          <Text style={styles.topTitle}>Mirai</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity style={styles.themeToggle} onPress={openNotifs}>
            <Ionicons name="notifications-outline" size={18} color={C.text2} />
            {unread > 0 && <View style={styles.notifDot}><Text style={styles.notifDotText}>{unread > 9 ? "9+" : unread}</Text></View>}
          </TouchableOpacity>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <TouchableOpacity onPress={onLogout}><Text style={styles.signout}>Sign out</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {showNotifs && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notifications</Text>
            {notifs.length === 0 ? <Text style={styles.empty}>You're all caught up.</Text> : notifs.slice(0, 15).map((n) => (
              <View key={n.id} style={[styles.notifItem, !n.isRead && { backgroundColor: C.accentSoft }]}>
                <Text style={styles.notifTitle}>{n.title}</Text>
                <Text style={styles.muted}>{n.body}</Text>
                {(n.metadata?.kind === "TIMEOFF_REQUEST" || n.metadata?.kind === "SWAP_REQUEST") && (
                  notifActed[n.id]
                    ? <Text style={styles.notifActed}>{notifActed[n.id]}</Text>
                    : <View style={styles.notifActions}>
                        <TouchableOpacity style={[styles.notifBtn, styles.notifAccept]} onPress={() => actOnNotif(n, true)}><Text style={styles.notifAcceptTxt}>Accept</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.notifBtn, styles.notifDecline]} onPress={() => actOnNotif(n, false)}><Text style={styles.notifDeclineTxt}>Decline</Text></TouchableOpacity>
                      </View>
                )}
              </View>
            ))}
          </View>
        )}
        {view !== "home" && (
          <TouchableOpacity style={[styles.card, { paddingVertical: 12 }]} onPress={() => setView(view === "myspace" ? "home" : "myspace")}>
            <Text style={{ color: C.accent, fontWeight: "600" }}>‹ Back</Text>
          </TouchableOpacity>
        )}
        {view === "myspace" && <MySpaceView ctx={ctx} />}
        {view === "home" && <HomeView ctx={ctx} />}
        {view === "timeoff" && !isManager && <TimeoffView ctx={ctx} />}
        {view === "approvals" && isManager && <ApprovalsView ctx={ctx} />}
        {view === "availability" && !isManager && <AvailabilityView ctx={ctx} />}
        {view === "timecard" && !isManager && <MyTimecardView ctx={ctx} />}
        {view === "certs" && !isManager && <CertsView ctx={ctx} />}
        {view === "mystaff" && isAdmin && <MyStaffView ctx={ctx} />}
        {view === "attendance" && isManager && <AttendanceView ctx={ctx} />}
        {view === "scheduling" && isManager && <SchedulingView ctx={ctx} />}
        {view === "factimecards" && isManager && <TimecardsView ctx={ctx} />}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomItem} onPress={() => { setView("home"); setMoreOpen(false); }}>
          <Text style={[styles.bottomItemText, view === "home" && styles.bottomItemActive]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomItem} onPress={() => setView("myspace")}>
          <Text style={[styles.bottomItemText, view !== "home" && styles.bottomItemActive]}>My Space</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

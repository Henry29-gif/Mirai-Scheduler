import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, StyleSheet, StatusBar, Platform, Appearance, Alert, AppState,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";

// API base URL — set per build via the EXPO_PUBLIC_API_URL env var (see
// .env.example + eas.json). SDK 54 inlines EXPO_PUBLIC_* at build time; it must
// be referenced with dot notation (process.env.EXPO_PUBLIC_API_URL) to inline.
// Production builds MUST point at the hosted HTTPS API — never an http:// LAN IP
// (Apple ATS / Google reject it, and a phone off your Wi-Fi can't reach it).
// The fallback is local dev only (your PC's Wi-Fi address, phone on same network).
const API = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.109:4000";

// Design system palette — light + dark
const LIGHT = {
  bg: "#F7F8FA", surface: "#FFFFFF", surface2: "#FBFCFD",
  text: "#0F1B2D", text2: "#5B677A",
  brand: "#14263D", accent: "#2AA6A1", accentSoft: "#E6F5F4",
  success: "#2F8F6B", successSoft: "#EAF6F1",
  warning: "#B7842B", warningSoft: "#FFF6E5",
  error: "#C64545", errorSoft: "#FBEAEA",
  border: "#E6EAF0", borderInput: "#DDE3EA",
};
const DARK = {
  bg: "#0B1220", surface: "#111B2E", surface2: "#0F1A2B",
  text: "#E6EDF5", text2: "#AAB6C5",
  brand: "#16273F", accent: "#34BDB7", accentSoft: "#14302F",
  success: "#5DCAA5", successSoft: "#122A22",
  warning: "#E3B266", warningSoft: "#2C2415",
  error: "#E07A7A", errorSoft: "#2C1717",
  border: "#1E2C44", borderInput: "#26344D",
};
// Current palette + stylesheet — reassigned by <App> when the theme changes.
let C = LIGHT;
const ROLE_COLORS = {
  ADMIN: { bg: "#E9EDF3", fg: "#1B3554" },
  MANAGER: { bg: "#E6F5F4", fg: "#1E7A75" },
  STAFF: { bg: "#EEF1F5", fg: "#5B677A" },
};
const CERT_COLORS = {
  RN: { bg: "#E9EDF3", fg: "#1B3554" },
  LPN: { bg: "#E6F5F4", fg: "#1E7A75" },
  CCA: { bg: "#ECF1FB", fg: "#3A62B0" },
};
const REASON = { SICK: "Sick call-in", SWAP: "Dropped", UNFILLED: "Open" };

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

function Chip({ value, map }) {
  if (!value) return null;
  const c = (map || {})[value] || { bg: "#EEF1F5", fg: "#5B677A" };
  return <View style={[styles.chip, { backgroundColor: c.bg }]}><Text style={[styles.chipText, { color: c.fg }]}>{value}</Text></View>;
}
const RoleChip = ({ value }) => <Chip value={value} map={ROLE_COLORS} />;
const CertChip = ({ value }) => <Chip value={value} map={CERT_COLORS} />;
function ReasonChip({ value }) {
  const m = { SICK: { bg: C.errorSoft, fg: C.error }, SWAP: { bg: C.warningSoft, fg: C.warning }, UNFILLED: { bg: "#EEF1F5", fg: C.text2 } }[value] || { bg: "#EEF1F5", fg: C.text2 };
  return <View style={[styles.chip, { backgroundColor: m.bg }]}><Text style={[styles.chipText, { color: m.fg }]}>{REASON[value] || "Open"}</Text></View>;
}

const fmtT = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtD = (d) => new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
// Leave dates are date-only at UTC midnight — format in UTC (no off-by-one).
const fmtDay = (d) => new Date(d).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });
const fmtMins = (m) => { const h = Math.floor((m || 0) / 60), mn = (m || 0) % 60; return h ? `${h}h ${mn}m` : `${mn}m`; };
const TO_STATUS = { PENDING: { bg: "#FFF6E5", fg: "#B7842B" }, APPROVED: { bg: "#EAF6F1", fg: "#2F8F6B" }, DENIED: { bg: "#FBEAEA", fg: "#C64545" } };

function LoginScreen({ onLogin, theme, onToggleTheme }) {
  const [mode, setMode] = useState("signin");       // "signin" | "forgot"
  const [email, setEmail] = useState("nurse@demo.com");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(next) { setMode(next); setError(""); setInfo(""); }

  async function submit() {
    setError(""); setInfo(""); setLoading(true);
    try {
      if (mode === "signin") {
        const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
        onLogin(data.token, data.user);
      } else {
        const data = await api("/api/auth/forgot-password", { method: "POST", body: { email } });
        setInfo((data && data.message) || "If an account exists, a reset link is on its way. Open it on this device to set a new password.");
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  return (
    <View style={styles.loginWrap}>
      <View style={styles.loginTheme}><ThemeToggle theme={theme} onToggle={onToggleTheme} /></View>
      <View style={styles.loginCard}>
        <View style={styles.brandRow}>
          <View style={styles.mark}><Text style={styles.markText}>+</Text></View>
          <Text style={styles.brandTitle}>NurseScheduler</Text>
        </View>
        <Text style={styles.muted}>{mode === "signin" ? "Sign in to manage shifts" : "Enter your email and we'll send a reset link"}</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        {mode === "signin" ? (<>
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
        </>) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {info ? <Text style={styles.note}>{info}</Text> : null}

        <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{mode === "signin" ? "Sign in" : "Send reset link"}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => switchMode(mode === "signin" ? "forgot" : "signin")}>
          <Text style={styles.linkBtn}>{mode === "signin" ? "Forgot password?" : "‹ Back to sign in"}</Text>
        </TouchableOpacity>
        {mode === "signin" ? <Text style={styles.hint}>Demo: nurse@demo.com · Password123!</Text> : null}
      </View>
    </View>
  );
}

function DashboardScreen({ token, user, onLogout, theme, onToggleTheme }) {
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
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthName = now.toLocaleString("default", { month: "long" });
  const isManager = user.role === "ADMIN" || user.role === "MANAGER";
  const isAdmin = user.role === "ADMIN";
  const myCert = me?.certification;
  const siteQ = isAdmin && siteId ? `&facilityId=${siteId}` : "";
  const money = (n) => "$" + Math.round(n || 0);
  const relColor = (label) => label === "Excellent" ? C.success : label === "Good" ? C.accent : label === "Fair" ? C.warning : label === "At risk" ? C.error : C.text2;
  const pad2 = (n) => String(n).padStart(2, "0");
  const currentSiteName = sites.find((s) => s.id === siteId)?.name;
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
  const staffingVal = (shift, cert) => { const r = staffing.find((x) => x.shift === shift && x.certification === cert); return r ? String(r.count) : "1"; };
  const setStaffingCell = (shift, cert, v) => { const count = Math.max(0, Math.min(20, parseInt(v, 10) || 0)); setStaffing((rows) => [...rows.filter((x) => !(x.shift === shift && x.certification === cert)), { shift, certification: cert, count }]); };

  async function loadAll() {
    try { setMe((await api("/api/users/me", { token })).user); } catch {}
    try { setShifts((await api(`/api/schedules?month=${month}&year=${year}${siteQ}`, { token })).shifts || []); } catch { setShifts([]); }
    try { setOpen((await api(`/api/shifts/open?month=${month}&year=${year}${siteQ}`, { token })).openShifts || []); } catch { setOpen([]); }
    try { setIncoming((await api("/api/swaps", { token })).incoming || []); } catch { setIncoming([]); }
    try { setTimeoff((await api(`/api/timeoff${isManager && siteId && isAdmin ? `?facilityId=${siteId}` : ""}`, { token })).requests || []); } catch { setTimeoff([]); }
    try { setAvailability((await api("/api/availability", { token })).blocks || []); } catch { setAvailability([]); }
    try { const n = await api("/api/notifications", { token }); setNotifs(n.notifications || []); setUnread(n.unread || 0); } catch {}
    try { setClock(await api("/api/clock/status", { token })); } catch {}
    try { setTimecard(await api("/api/clock/timecard?days=14", { token })); } catch { setTimecard(null); }
    try { setCerts((await api("/api/certifications", { token })).certifications || []); } catch { setCerts([]); }
    await loadMyDocs();
    if (isAdmin) { try { setRoster((await api(`/api/staff/roster?month=${month}&year=${year}${siteQ}`, { token })).staff || []); } catch { setRoster([]); } }
    if (isManager) { try { setAttendance(await api(`/api/clock/attendance${siteId && isAdmin ? `?facilityId=${siteId}` : ""}`, { token })); } catch { setAttendance({ onNow: [], totalStaff: 0 }); } }
    if (isManager) { try { setWorkload(await api(`/api/schedules/workload?month=${month}&year=${year}${siteQ}`, { token })); } catch { setWorkload({ periodId: null, status: null, staff: [], summary: { min: 0, max: 0, openShifts: 0, totalAssigned: 0 } }); } }
    if (isManager) { try { setFacTimecards(await api(`/api/clock/facility-timecards?days=14${siteQ}`, { token })); } catch { setFacTimecards({ staff: [], rangeDays: 14 }); } }
  }
  async function loadStaffing() {
    if (!isManager) return;
    try { setStaffing((await api(`/api/schedules/requirements${isAdmin && siteId ? `?facilityId=${siteId}` : ""}`, { token })).requirements || []); } catch { setStaffing([]); }
  }
  useEffect(() => { loadStaffing(); }, [siteId]);
  // Load sites once (admin), then (re)load everything whenever the site changes.
  useEffect(() => {
    if (!isAdmin) return;
    api("/api/facilities", { token }).then((d) => { setSites(d.facilities || []); if (d.facilities?.length && !siteId) setSiteId(d.facilities[0].id); }).catch(() => {});
  }, []);
  useEffect(() => { loadAll(); }, [siteId]);
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

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <View style={styles.markSm}><Text style={styles.markTextSm}>+</Text></View>
          <Text style={styles.topTitle}>NurseScheduler</Text>
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
              </View>
            ))}
          </View>
        )}
        {view !== "home" && (
          <TouchableOpacity style={[styles.card, { paddingVertical: 12 }]} onPress={() => setView(view === "myspace" ? "home" : "myspace")}>
            <Text style={{ color: C.accent, fontWeight: "600" }}>‹ Back</Text>
          </TouchableOpacity>
        )}
        {view === "myspace" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>My Space</Text>
            {(isManager
              ? [
                  { label: "Staffing & schedule", sub: "Set needs, generate, balance & post", v: "scheduling" },
                  ...(isAdmin ? [{ label: "My Staff", sub: "Profiles, pay & reliability", v: "mystaff" }] : []),
                  { label: "Live attendance", sub: "Who's clocked in right now", v: "attendance" },
                  { label: "Timecards", sub: "Review & approve staff hours", v: "factimecards" },
                  { label: "Time-off approvals", sub: "Review staff leave requests", v: "approvals" },
                ]
              : [{ label: "Request time off", sub: "Submit and track leave requests", v: "timeoff" }, { label: "My availability", sub: "Set the shifts you can work", v: "availability" }, { label: "My timecard", sub: "Your clock-in history & hours", v: "timecard" }, { label: "Certification", sub: "Your licenses & expiry dates", v: "certs" }]
            ).map((it) => (
              <TouchableOpacity key={it.v} style={styles.myspaceLink} onPress={() => setView(it.v)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.myspaceLinkTitle}>{it.label}</Text>
                  <Text style={styles.muted}>{it.sub}</Text>
                </View>
                <Text style={{ color: C.text2, fontSize: 20 }}>›</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.dangerZone}>
              <Text style={styles.dangerTitle}>Delete account</Text>
              <Text style={styles.muted}>Erases your personal details and disables sign-in. This can't be undone.</Text>
              <TouchableOpacity style={styles.btnDanger} onPress={deleteAccount}>
                <Text style={styles.btnDangerText}>Delete account</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {view === "home" && (<>
        {isAdmin && sites.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Site</Text>
            {siteSwitcher}
          </View>
        )}
        <View style={styles.card}>
          <Text style={styles.welcome}>Welcome, {user.firstName}</Text>
          <View style={styles.rowMid}>
            <RoleChip value={user.role} />
            <CertChip value={myCert} />
            <Text style={styles.muted}>  {user.firstName} {user.lastName}</Text>
          </View>
          {msg ? <Text style={styles.note}>{msg}</Text> : null}
        </View>

        {!isManager && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Time clock</Text>
            <View style={styles.clockRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.clockState, { color: clock.clockedIn ? C.success : C.text2 }]}>{clock.clockedIn ? "Clocked in" : "Clocked out"}</Text>
                <Text style={styles.muted}>{clock.clockedIn ? `Since ${fmtT(clock.since)} · ` : ""}Today: {fmtMins(clock.todayMinutes)}</Text>
              </View>
              <TouchableOpacity style={[styles.clockBtn, { backgroundColor: clock.clockedIn ? C.error : C.accent }]} disabled={busy} onPress={toggleClock}>
                <Text style={styles.btnText}>{clock.clockedIn ? "Clock out" : "Clock in"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {incoming.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Incoming trade requests ({incoming.length})</Text>
            {incoming.map((sw) => (
              <View key={sw.id} style={styles.tradeIncoming}>
                <Text style={styles.tradeFrom}>{sw.requestor.firstName} {sw.requestor.lastName} wants to trade</Text>
                <View style={[styles.leg, { backgroundColor: C.successSoft }]}><Text style={{ color: C.success, fontSize: 13 }}>You'd work: {fmtD(sw.originalShift.startTime)}, {fmtT(sw.originalShift.startTime)}–{fmtT(sw.originalShift.endTime)}</Text></View>
              <View style={[styles.leg, { backgroundColor: C.warningSoft }]}><Text style={{ color: C.warning, fontSize: 13 }}>They'd take: {fmtD(sw.offeredShift.startTime)}, {fmtT(sw.offeredShift.startTime)}–{fmtT(sw.offeredShift.endTime)}</Text></View>
                <View style={styles.tradeBtns}>
                  <TouchableOpacity style={styles.acceptBtn} disabled={busy} onPress={() => respond(sw.id, true)}><Text style={styles.btnText}>Accept</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.declineBtn} disabled={busy} onPress={() => respond(sw.id, false)}><Text style={{ color: C.brand, fontWeight: "600" }}>Decline</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Available shifts {grabbable.length ? `(${grabbable.length})` : ""}</Text>
          {grabbable.length === 0 ? (
            <Text style={styles.empty}>No open shifts you can take right now.</Text>
          ) : grabbable.slice(0, 15).map((s) => (
            <View key={s.id} style={styles.shiftRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowMid}><CertChip value={s.requiredCertification} /><ReasonChip value={s.openReason} /></View>
                <Text style={styles.muted}>{fmtD(s.startTime)} · {fmtT(s.startTime)}–{fmtT(s.endTime)} · {s.unit?.name}</Text>
              </View>
              {!isManager && <TouchableOpacity style={styles.acceptBtn} disabled={busy} onPress={() => accept(s.id)}><Text style={styles.btnText}>Accept</Text></TouchableOpacity>}
            </View>
          ))}
        </View>

        {!isManager && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My shifts · {monthName}</Text>

          {shifts.length === 0 ? (
            <Text style={styles.empty}>No shifts scheduled yet.</Text>
          ) : shifts.slice(0, 20).map((s) => {
            const mine = s.staff?.id === (me?.id || user.id);
            return (
              <View key={s.id}>
                <View style={styles.shiftRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowMid}><CertChip value={s.requiredCertification} /><Text style={styles.shiftName}>  {s.staff?.firstName} {s.staff?.lastName}{mine ? " (you)" : ""}</Text></View>
                    <Text style={styles.muted}>{fmtD(s.startTime)} · {fmtT(s.startTime)}–{fmtT(s.endTime)} · {s.unit?.name}</Text>
                  </View>
                  {mine && (
                    <View style={{ alignItems: "flex-end" }}>
                      <TouchableOpacity onPress={() => openTrade(s.id)}><Text style={styles.linkTrade}>{tradeFor === s.id ? "Close" : "Trade"}</Text></TouchableOpacity>
                      <View style={styles.rowMid}>
                        <TouchableOpacity onPress={() => drop(s.id)}><Text style={styles.linkDrop}>Drop</Text></TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>

                {tradeFor === s.id && (
                  <View style={styles.tradePanel}>
                    {!tradeOpts ? <Text style={styles.muted}>Loading coworkers…</Text> : (
                      <>
                        <Text style={styles.tradeMine}>You give up: {fmtD(tradeOpts.myShift.startTime)}, {fmtT(tradeOpts.myShift.startTime)}–{fmtT(tradeOpts.myShift.endTime)}</Text>
                        {tradeOpts.coworkers.length === 0 ? <Text style={styles.muted}>No rest-compatible coworker shifts to trade for.</Text> :
                          tradeOpts.coworkers.map((c) => (
                            <View key={c.id} style={{ marginTop: 8 }}>
                              <Text style={styles.tradeCoworker}>{c.name}</Text>
                              {c.shifts.map((os) => (
                                <View key={os.id} style={styles.tradeOffer}>
                                  <Text style={{ flex: 1, fontSize: 13, color: C.text }}>You'd work: {fmtD(os.startTime)}, {fmtT(os.startTime)}–{fmtT(os.endTime)}</Text>
                                  <TouchableOpacity style={styles.acceptBtnSm} disabled={busy} onPress={() => proposeTrade(os.id)}><Text style={styles.btnTextSm}>Request</Text></TouchableOpacity>
                                </View>
                              ))}
                            </View>
                          ))}
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
        )}
        </>)}

        {view === "timeoff" && !isManager && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Request time off</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
              <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: "center" }]} onPress={() => setPickerFor("start")}>
                <Text style={{ color: toStart ? C.text : C.text2, fontSize: 15 }}>{toStart ? fmtDay(toStart) : "From"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: "center" }]} onPress={() => setPickerFor("end")}>
                <Text style={{ color: toEnd ? C.text : C.text2, fontSize: 15 }}>{toEnd ? fmtDay(toEnd) : "To"}</Text>
              </TouchableOpacity>
            </View>
            {pickerFor && (
              <DateTimePicker
                value={((pickerFor === "start" ? toStart : toEnd) ? new Date((pickerFor === "start" ? toStart : toEnd) + "T00:00:00") : new Date())}
                mode="date"
                onChange={onPickDate}
              />
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {["VACATION", "SICK", "PERSONAL", "UNPAID"].map((tp) => (
                <TouchableOpacity key={tp} style={[styles.typeChip, toType === tp && styles.typeChipOn]} onPress={() => setToType(tp)}>
                  <Text style={[styles.typeChipText, toType === tp && styles.typeChipTextOn]}>{tp[0] + tp.slice(1).toLowerCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} value={toReason} onChangeText={setToReason} placeholder="Reason (optional)" placeholderTextColor={C.text2} />
            <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={submitTimeoff} disabled={busy}><Text style={styles.btnText}>Submit request</Text></TouchableOpacity>
            {timeoff.map((t) => (
              <View key={t.id} style={styles.toItem}>
                <Text style={{ color: C.text, fontSize: 13 }}>{fmtDay(t.startDate)} – {fmtDay(t.endDate)} · {t.type.toLowerCase()}</Text>
                <View style={[styles.chip, { backgroundColor: (TO_STATUS[t.status] || TO_STATUS.PENDING).bg }]}><Text style={[styles.chipText, { color: (TO_STATUS[t.status] || TO_STATUS.PENDING).fg }]}>{t.status[0] + t.status.slice(1).toLowerCase()}</Text></View>
              </View>
            ))}
          </View>
        )}
        {view === "approvals" && isManager && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Time-off approvals {timeoff.filter((t) => t.status === "PENDING").length ? `(${timeoff.filter((t) => t.status === "PENDING").length})` : ""}</Text>
            {timeoff.filter((t) => t.status === "PENDING").length === 0 ? (
              <Text style={styles.empty}>No pending requests.</Text>
            ) : timeoff.filter((t) => t.status === "PENDING").map((t) => (
              <View key={t.id} style={styles.toApproval}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shiftName}>{t.user.firstName} {t.user.lastName}</Text>
                  <Text style={styles.muted}>{fmtDay(t.startDate)} – {fmtDay(t.endDate)} · {t.type.toLowerCase()}{t.reason ? ` · "${t.reason}"` : ""}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <TouchableOpacity style={styles.acceptBtnSm} disabled={busy} onPress={() => respondTimeoff(t.id, true)}><Text style={styles.btnTextSm}>Approve</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => respondTimeoff(t.id, false)}><Text style={styles.linkSick}>Deny</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {view === "availability" && !isManager && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>My availability</Text>
            <Text style={[styles.muted, { marginBottom: 10 }]}>Tap a slot to mark yourself off.</Text>
            <View style={styles.availRow}>
              <Text style={styles.availDayLabel}></Text>
              {["Day", "Eve", "Night"].map((s) => <Text key={s} style={styles.availColLabel}>{s}</Text>)}
            </View>
            {[["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]].map(([label, dow]) => (
              <View key={dow} style={styles.availRow}>
                <Text style={styles.availDayLabel}>{label}</Text>
                {["Day", "Evening", "Night"].map((s) => {
                  const off = isBlocked(dow, s);
                  return (
                    <TouchableOpacity key={s} style={[styles.availCell, { backgroundColor: off ? C.errorSoft : C.accentSoft }]} onPress={() => toggleAvail(dow, s)}>
                      <Text style={{ color: off ? C.error : C.accent, fontWeight: "500", fontSize: 12 }}>{off ? "Off" : "On"}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {view === "timecard" && !isManager && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>My timecard {timecard ? `· ${fmtMins(timecard.totalMinutes)}` : ""}</Text>
            {(!timecard || timecard.days.length === 0) ? (
              <Text style={styles.empty}>No clock-ins yet. Use the Time clock on your home screen.</Text>
            ) : timecard.days.map((d) => (
              <View key={d.date} style={styles.tcDay}>
                <Text style={{ fontWeight: "500", color: C.text }}>{fmtDay(d.date)}  <Text style={styles.muted}>· {fmtMins(d.minutes)}</Text></Text>
                {d.sessions.map((s, i) => (
                  <Text key={i} style={styles.muted}>{fmtT(s.in)} – {s.out ? fmtT(s.out) : "in progress"}</Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {view === "certs" && !isManager && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Certification</Text>
            <Text style={[styles.muted, { marginBottom: 8 }]}>Your licenses &amp; credentials with expiry dates.</Text>
            <TextInput style={styles.input} value={certForm.name} onChangeText={(v) => setCertForm({ ...certForm, name: v })} placeholder="Name (e.g. RN License, CPR)" placeholderTextColor={C.text2} />
            <TextInput style={[styles.input, { marginTop: 8 }]} value={certForm.number} onChangeText={(v) => setCertForm({ ...certForm, number: v })} placeholder="Number (optional)" placeholderTextColor={C.text2} />
            <TouchableOpacity style={[styles.input, { marginTop: 8, justifyContent: "center" }]} onPress={() => setCertExpPicker(true)}>
              <Text style={{ color: certForm.expiryDate ? C.text : C.text2, fontSize: 15 }}>{certForm.expiryDate ? `Expires ${fmtDay(certForm.expiryDate)}` : "Expiry date (optional)"}</Text>
            </TouchableOpacity>
            {certExpPicker && <DateTimePicker value={certForm.expiryDate ? new Date(certForm.expiryDate + "T00:00:00") : new Date()} mode="date" onChange={onCertExpPick} />}
            <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={addCert} disabled={busy}><Text style={styles.btnText}>Add certification</Text></TouchableOpacity>
            {msg ? <Text style={styles.note}>{msg}</Text> : null}
            {certs.length === 0 ? <Text style={styles.empty}>No certifications yet.</Text> : certs.map((c) => {
              const st = certStatus(c.expiryDate);
              return (
                <View key={c.id} style={styles.shiftRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shiftName}>{c.name}</Text>
                    <Text style={styles.muted}>{c.number ? c.number + " · " : ""}{c.expiryDate ? `Expires ${fmtDay(c.expiryDate)}` : "No expiry date"}</Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: st.color + "22" }]}><Text style={[styles.chipText, { color: st.color }]}>{st.label}</Text></View>
                  <TouchableOpacity onPress={() => deleteCert(c.id)}><Text style={[styles.linkDrop, { marginLeft: 10 }]}>Remove</Text></TouchableOpacity>
                </View>
              );
            })}
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontWeight: "600", color: C.text, marginBottom: 4 }}>Documents ({myDocs.length})</Text>
              <Text style={[styles.muted, { marginBottom: 8 }]}>PDF copies of your licenses or certificates. Only you &amp; your managers can see these.</Text>
              {myDocs.length === 0 ? <Text style={styles.muted}>No documents yet.</Text> : myDocs.map((dc) => (
                <View key={dc.id} style={styles.tcRow}>
                  <Text style={{ flex: 1, color: C.text, fontSize: 13 }} numberOfLines={1}>{dc.filename}</Text>
                  <TouchableOpacity onPress={() => downloadFile(`${API}/api/my/documents/${dc.id}/download`, dc.filename)}><Text style={styles.linkTrade}>Open</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteMyDoc(dc.id)}><Text style={[styles.linkDrop, { marginLeft: 12 }]}>Delete</Text></TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={[styles.acceptBtnSm, { marginTop: 8, alignSelf: "flex-start" }]} onPress={uploadMyDocs}><Text style={styles.btnTextSm}>Upload PDFs</Text></TouchableOpacity>
              {docMsg ? <Text style={styles.note}>{docMsg}</Text> : null}
            </View>
          </View>
        )}

        {view === "mystaff" && isAdmin && (
          <View style={styles.card}>
            {siteSwitcher}
            <Text style={styles.cardTitle}>My Staff{sites.find((s) => s.id === siteId) ? ` · ${sites.find((s) => s.id === siteId).name}` : ""}</Text>
            {roster.length === 0 ? <Text style={styles.empty}>No staff at this site.</Text> : roster.map((s) => (
              <View key={s.userId}>
                <TouchableOpacity style={styles.shiftRow} onPress={() => { const open = staffSel === s.userId; setStaffSel(open ? null : s.userId); if (!open) { setDocMsg(""); loadStaffDocs(s.userId); loadStaffCerts(s.userId); } }}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowMid}><Text style={styles.shiftName}>{s.firstName} {s.lastName}  </Text><CertChip value={s.certification} /></View>
                    <Text style={styles.muted}>{s.shiftsWorked}/{s.shiftsScheduledPast} shifts · {s.attendancePct == null ? "—" : s.attendancePct + "%"} · {money(s.pay)}</Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: relColor(s.reliabilityLabel) + "22" }]}><Text style={[styles.chipText, { color: relColor(s.reliabilityLabel) }]}>{s.reliabilityLabel}</Text></View>
                </TouchableOpacity>
                {staffSel === s.userId && (
                  <View style={styles.staffDetail}>
                    {[
                      ["Shifts worked / scheduled", `${s.shiftsWorked} / ${s.shiftsScheduledPast}`],
                      ["Attendance", s.attendancePct == null ? "—" : s.attendancePct + "%"],
                      ["On-time", (s.punctualityPct == null ? "—" : s.punctualityPct + "%") + ` · ${s.lateCount} late`],
                      ["Call-ins (sick)", String(s.callIns)],
                      [`${monthName} pay · ${s.payHours}h`, money(s.pay)],
                      ["Reliability", s.reliabilityScore == null ? "—" : `${s.reliabilityScore} · ${s.reliabilityLabel}`],
                      ["Documents", String(staffDocs.length)],
                    ].map(([k, v]) => (
                      <View key={k} style={styles.sdRow}><Text style={styles.muted}>{k}</Text><Text style={styles.sdVal}>{v}</Text></View>
                    ))}
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontWeight: "600", color: C.text, marginBottom: 6 }}>Certifications ({staffCerts.length})</Text>
                      {staffCerts.length === 0 ? <Text style={styles.muted}>None recorded.</Text> : staffCerts.map((c) => {
                        const st = certStatus(c.expiryDate);
                        return (
                          <View key={c.id} style={styles.tcRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: C.text, fontSize: 13 }}>{c.name}{c.number ? ` · ${c.number}` : ""}</Text>
                              <Text style={styles.muted}>{c.expiryDate ? `exp ${fmtDay(c.expiryDate)}` : "no expiry"}</Text>
                            </View>
                            <View style={[styles.chip, { backgroundColor: st.color + "22" }]}><Text style={[styles.chipText, { color: st.color }]}>{st.label}</Text></View>
                          </View>
                        );
                      })}
                    </View>
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontWeight: "600", color: C.text, marginBottom: 6 }}>Documents ({staffDocs.length})</Text>
                      {staffDocs.length === 0 ? <Text style={styles.muted}>No files yet.</Text> : staffDocs.map((dc) => (
                        <View key={dc.id} style={styles.tcRow}>
                          <Text style={{ flex: 1, color: C.text, fontSize: 13 }} numberOfLines={1}>{dc.filename}</Text>
                          <View style={[styles.chip, { backgroundColor: (dc.source === "STAFF" ? C.accent : C.text2) + "22", marginRight: 10 }]}><Text style={[styles.chipText, { color: dc.source === "STAFF" ? C.accent : C.text2 }]}>{dc.source === "STAFF" ? "Staff" : "Admin"}</Text></View>
                          <TouchableOpacity onPress={() => downloadFile(`${API}/api/staff/${s.userId}/documents/${dc.id}/download`, dc.filename)}><Text style={styles.linkTrade}>Open</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteDoc(s.userId, dc.id)}><Text style={[styles.linkDrop, { marginLeft: 12 }]}>Delete</Text></TouchableOpacity>
                        </View>
                      ))}
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <TouchableOpacity style={styles.acceptBtnSm} onPress={() => uploadDocs(s.userId)}><Text style={styles.btnTextSm}>Upload PDFs</Text></TouchableOpacity>
                        {staffDocs.length > 0 && <TouchableOpacity style={styles.btnSm} onPress={() => downloadFile(`${API}/api/staff/${s.userId}/documents/merged`, `${s.firstName}_${s.lastName}_documents.pdf`)}><Text style={styles.btnText}>Download all</Text></TouchableOpacity>}
                      </View>
                      {docMsg ? <Text style={styles.note}>{docMsg}</Text> : null}
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {view === "attendance" && isManager && (
          <View style={styles.card}>
            {siteSwitcher}
            <Text style={styles.cardTitle}>Who's clocked in · {attendance.onNow.length}/{attendance.totalStaff}</Text>
            {attendance.onNow.length === 0 ? <Text style={styles.empty}>No one is clocked in right now.</Text> : attendance.onNow.map((p) => (
              <View key={p.id} style={styles.shiftRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowMid}><View style={styles.onDot} /><Text style={styles.shiftName}> {p.firstName} {p.lastName}  </Text><CertChip value={p.certification} /></View>
                  <Text style={styles.muted}>On since {fmtT(p.since)} · {fmtMins(p.minutes)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {view === "scheduling" && isManager && (<>
          <View style={styles.card}>
            {siteSwitcher}
            <Text style={styles.cardTitle}>Staffing needs{currentSiteName ? ` · ${currentSiteName}` : ""}</Text>
            <Text style={[styles.muted, { marginBottom: 8 }]}>How many of each role per shift. 0 = none. Save, then Generate.</Text>
            <View style={styles.gridRow}>
              <Text style={styles.gridLabel}></Text>
              {["RN", "LPN", "CCA"].map((c) => <Text key={c} style={styles.gridHeadCell}>{c}</Text>)}
            </View>
            {["Day", "Evening", "Night"].map((shift) => (
              <View key={shift} style={styles.gridRow}>
                <Text style={styles.gridLabel}>{shift}</Text>
                {["RN", "LPN", "CCA"].map((cert) => (
                  <TextInput key={cert} style={styles.gridInput} keyboardType="number-pad" value={staffingVal(shift, cert)} onChangeText={(v) => setStaffingCell(shift, cert, v)} />
                ))}
              </View>
            ))}
            <TouchableOpacity style={[styles.btn, { marginTop: 12 }]} onPress={saveStaffing} disabled={busy}><Text style={styles.btnText}>Save needs</Text></TouchableOpacity>

            <Text style={styles.label}>Schedule dates</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: "center" }]} onPress={() => setSchedPickerFor("start")}><Text style={{ color: C.text, fontSize: 15 }}>{fmtDay(schedRange.start)}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: "center" }]} onPress={() => setSchedPickerFor("end")}><Text style={{ color: C.text, fontSize: 15 }}>{fmtDay(schedRange.end)}</Text></TouchableOpacity>
            </View>
            {schedPickerFor && (
              <DateTimePicker value={new Date((schedPickerFor === "start" ? schedRange.start : schedRange.end) + "T00:00:00")} mode="date" onChange={onSchedPick} />
            )}
            <TouchableOpacity style={[styles.btn, { marginTop: 12 }]} onPress={generateRange} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Generate schedule</Text>}</TouchableOpacity>
            {msg ? <Text style={styles.note}>{msg}</Text> : null}
          </View>

          {workload.staff.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Distribution preview</Text>
                <View style={[styles.chip, { backgroundColor: workload.status === "PUBLISHED" ? C.successSoft : C.warningSoft }]}><Text style={[styles.chipText, { color: workload.status === "PUBLISHED" ? C.success : C.warning }]}>{workload.status === "PUBLISHED" ? "Posted" : "Draft"}</Text></View>
              </View>
              <Text style={[styles.muted, { marginBottom: 6 }]}>{workload.summary.totalAssigned} assigned · {workload.summary.openShifts} open · spread {workload.summary.min}–{workload.summary.max}/person</Text>
              {workload.staff.map((s) => (
                <View key={s.userId} style={styles.sdRow}><Text style={{ color: C.text, fontSize: 13 }}>{s.firstName} {s.lastName}</Text><Text style={styles.muted}>{s.shiftCount} shifts · {s.hours}h</Text></View>
              ))}
              {workload.status !== "PUBLISHED" && <TouchableOpacity style={[styles.btn, { marginTop: 12 }]} onPress={postSchedule} disabled={busy}><Text style={styles.btnText}>Post schedule</Text></TouchableOpacity>}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Schedule · {monthName}</Text>
            {shifts.length === 0 ? <Text style={styles.empty}>No shifts yet — generate above.</Text> : shifts.slice(0, 40).map((s) => (
              <View key={s.id}>
                <View style={styles.shiftRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowMid}><CertChip value={s.requiredCertification} /><Text style={styles.shiftName}>  {s.staff?.firstName} {s.staff?.lastName}</Text></View>
                    <Text style={styles.muted}>{fmtD(s.startTime)} · {fmtT(s.startTime)}–{fmtT(s.endTime)} · {s.unit?.name}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <TouchableOpacity onPress={() => openReassign(s.id)}><Text style={styles.linkTrade}>{reassignFor === s.id ? "Close" : "Reassign"}</Text></TouchableOpacity>
                    <View style={styles.rowMid}>
                      <TouchableOpacity onPress={() => callSick(s.id)}><Text style={styles.linkSick}>Sick </Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => drop(s.id)}><Text style={styles.linkDrop}>Drop</Text></TouchableOpacity>
                    </View>
                  </View>
                </View>
                {reassignFor === s.id && (
                  <View style={styles.tradePanel}>
                    {reassignCands === null ? <Text style={styles.muted}>Loading eligible coworkers…</Text> : reassignCands.length === 0 ? <Text style={styles.muted}>No eligible coworker (cert + 8h rest).</Text> : (
                      <>
                        <Text style={[styles.muted, { marginBottom: 4 }]}>Move this shift to:</Text>
                        {reassignCands.map((c) => (
                          <TouchableOpacity key={c.id} style={styles.tradeOffer} onPress={() => doReassign(s.id, c.id)}>
                            <Text style={{ flex: 1, color: C.text, fontSize: 13 }}>{c.name} · {c.weeklyHours}h{c.wouldBeOvertime ? " · OT" : ""}</Text>
                            <View style={styles.acceptBtnSm}><Text style={styles.btnTextSm}>Move</Text></View>
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        </>)}

        {view === "factimecards" && isManager && (
          <View style={styles.card}>
            {siteSwitcher}
            <Text style={styles.cardTitle}>Timecards · last {facTimecards.rangeDays}d</Text>
            {facTimecards.staff.length === 0 ? <Text style={styles.empty}>No clock-ins in this period.</Text> : facTimecards.staff.map((s) => (
              <View key={s.userId} style={styles.tcStaff}>
                <TouchableOpacity onPress={() => setTcSel(tcSel === s.userId ? null : s.userId)}>
                  <Text style={styles.shiftName}>{s.firstName} {s.lastName}  <Text style={styles.muted}>· {fmtMins(s.totalMinutes)} · {s.pendingDays ? `${s.pendingDays} to approve` : "all approved"}</Text></Text>
                </TouchableOpacity>
                {tcSel === s.userId && s.days.map((d) => (
                  <View key={d.date} style={styles.tcRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 13 }}>{fmtDay(d.date)} · {fmtMins(d.minutes)}</Text>
                      {d.missedPunch ? <Text style={{ color: C.warning, fontSize: 12 }}>Missed punch</Text> : null}
                    </View>
                    {d.approval
                      ? <TouchableOpacity onPress={() => reopenDay(s.userId, d.date)}><Text style={styles.linkDrop}>Reopen</Text></TouchableOpacity>
                      : <TouchableOpacity style={styles.acceptBtnSm} disabled={busy} onPress={() => approveDay(s.userId, d.date)}><Text style={styles.btnTextSm}>Approve</Text></TouchableOpacity>}
                    {d.missedPunch ? <TouchableOpacity onPress={() => setFixingDay({ userId: s.userId, date: d.date })}><Text style={[styles.linkTrade, { marginLeft: 12 }]}>Fix</Text></TouchableOpacity> : null}
                  </View>
                ))}
              </View>
            ))}
            {fixingDay && <DateTimePicker value={new Date()} mode="time" onChange={onFixTime} />}
            {msg ? <Text style={styles.note}>{msg}</Text> : null}
          </View>
        )}
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

export default function App() {
  const [auth, setAuth] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [theme, setTheme] = useState(Appearance.getColorScheme() === "dark" ? "dark" : "light");
  // Recompute the active palette + stylesheet whenever the theme changes.
  C = theme === "dark" ? DARK : LIGHT;
  styles = useMemo(() => makeStyles(C), [theme]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // ── Auth persistence (expo-secure-store) + 7-min inactivity auto sign-out ──
  const IDLE_MS = 7 * 60 * 1000;
  const lastActivity = useRef(Date.now());
  const bump = () => { lastActivity.current = Date.now(); };

  const clearSession = async () => {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync("ns_token"),
        SecureStore.deleteItemAsync("ns_user"),
        SecureStore.deleteItemAsync("ns_last_activity"),
      ]);
    } catch {}
  };
  const signIn = async (token, user) => {
    lastActivity.current = Date.now();
    setAuth({ token, user });
    try {
      await SecureStore.setItemAsync("ns_token", token);
      await SecureStore.setItemAsync("ns_user", JSON.stringify(user));
      await SecureStore.setItemAsync("ns_last_activity", String(Date.now()));
    } catch {}
  };
  const signOut = () => { setAuth(null); clearSession(); };

  // Restore a saved session on launch — unless it's been idle longer than IDLE_MS.
  useEffect(() => {
    (async () => {
      try {
        const [t, u, la] = await Promise.all([
          SecureStore.getItemAsync("ns_token"),
          SecureStore.getItemAsync("ns_user"),
          SecureStore.getItemAsync("ns_last_activity"),
        ]);
        const idleFor = la ? Date.now() - Number(la) : Infinity;
        if (t && u && idleFor <= IDLE_MS) { lastActivity.current = Date.now(); setAuth({ token: t, user: JSON.parse(u) }); }
        else if (t || u) { await clearSession(); }
      } catch {}
      setRestoring(false);
    })();
  }, []);

  // While signed in: idle timer + re-check on returning to the app; stamp the
  // last-activity time when the app is backgrounded (so the launch check is right).
  useEffect(() => {
    if (!auth) return;
    const check = () => { if (Date.now() - lastActivity.current > IDLE_MS) signOut(); };
    const iv = setInterval(check, 20000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
      else SecureStore.setItemAsync("ns_last_activity", String(lastActivity.current)).catch(() => {});
    });
    return () => { clearInterval(iv); sub.remove(); };
  }, [auth]);

  return (
    <View style={{ flex: 1 }} onStartShouldSetResponderCapture={() => { bump(); return false; }}>
      <StatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} />
      {restoring
        ? <View style={[styles.flex, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={C.accent} /></View>
        : auth
        ? <DashboardScreen token={auth.token} user={auth.user} onLogout={signOut} theme={theme} onToggleTheme={toggleTheme} />
        : <LoginScreen onLogin={signIn} theme={theme} onToggleTheme={toggleTheme} />}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  themeToggle: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  loginTheme: { position: "absolute", top: 20, right: 20, zIndex: 10 },
  muted: { color: C.text2, fontSize: 13 },

  loginWrap: { flex: 1, backgroundColor: C.brand, justifyContent: "center", padding: 24 },
  loginCard: { backgroundColor: C.surface, borderRadius: 12, padding: 24, maxWidth: 420, width: "100%", alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  mark: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  markSm: { width: 26, height: 26, borderRadius: 7, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  markText: { color: "#fff", fontWeight: "600", fontSize: 18 },
  markTextSm: { color: "#fff", fontWeight: "600", fontSize: 15 },
  brandTitle: { fontSize: 22, fontWeight: "700", color: C.text, letterSpacing: -0.2 },
  label: { fontWeight: "500", fontSize: 13, marginTop: 16, marginBottom: 6, color: C.text },
  input: { borderWidth: 1, borderColor: C.borderInput, borderRadius: 10, height: 44, paddingHorizontal: 14, fontSize: 15, color: C.text },
  btn: { backgroundColor: C.accent, borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 18 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  btnTextSm: { color: "#fff", fontWeight: "600", fontSize: 13 },
  hint: { color: C.text2, fontSize: 13, marginTop: 16 },
  linkBtn: { color: C.accent, fontSize: 14, fontWeight: "500", textAlign: "center", marginTop: 14 },
  error: { color: C.error, backgroundColor: C.errorSoft, padding: 10, borderRadius: 10, marginTop: 14 },
  note: { color: C.success, backgroundColor: C.successSoft, padding: 10, borderRadius: 10, marginTop: 12 },
  dangerZone: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border },
  dangerTitle: { fontSize: 15, fontWeight: "600", color: C.error, marginBottom: 2 },
  btnDanger: { marginTop: 12, borderWidth: 1, borderColor: C.error, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  btnDangerText: { color: C.error, fontWeight: "600", fontSize: 14 },

  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.surface, paddingHorizontal: 18, paddingVertical: 16, paddingTop: Platform.OS === "android" ? 38 : 16, borderBottomWidth: 1, borderBottomColor: C.border },
  topTitle: { fontWeight: "600", fontSize: 16, color: C.text },
  signout: { color: C.accent, fontWeight: "600" },
  scroll: { padding: 16, paddingBottom: 80, gap: 16 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 58, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  bottomItem: { paddingHorizontal: 26, paddingVertical: 9, borderRadius: 10 },
  bottomItemText: { fontSize: 14, fontWeight: "500", color: C.text2 },
  bottomItemActive: { color: C.accent },
  myspaceMenu: { position: "absolute", bottom: 66, right: 18, width: 220, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: "hidden", zIndex: 50, elevation: 6 },
  myspaceLink: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 16, marginTop: 10 },
  myspaceLinkTitle: { fontSize: 15, fontWeight: "500", color: C.text },
  clockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  clockState: { fontSize: 17, fontWeight: "600" },
  clockBtn: { borderRadius: 10, paddingHorizontal: 22, paddingVertical: 13, justifyContent: "center" },
  tcDay: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },

  card: { backgroundColor: C.surface, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: C.border },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cardTitle: { fontWeight: "600", fontSize: 16, color: C.text, marginBottom: 8, letterSpacing: -0.2 },
  welcome: { fontSize: 18, fontWeight: "600", marginBottom: 8, color: C.text, letterSpacing: -0.2 },
  rowMid: { flexDirection: "row", alignItems: "center" },

  chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, marginRight: 4 },
  chipText: { fontWeight: "500", fontSize: 11 },
  siteChip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.surface2 },
  siteChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  siteChipText: { color: C.text, fontSize: 13, fontWeight: "500" },
  siteChipTextOn: { color: "#fff" },
  staffDetail: { backgroundColor: C.surface2, borderRadius: 10, padding: 12, marginBottom: 10 },
  sdRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.border },
  sdVal: { color: C.text, fontWeight: "600", fontSize: 13 },
  onDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: C.success },
  gridRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  gridLabel: { width: 70, color: C.text, fontWeight: "500", fontSize: 14 },
  gridHeadCell: { flex: 1, textAlign: "center", color: C.text2, fontSize: 12, fontWeight: "600" },
  gridInput: { flex: 1, marginHorizontal: 4, borderWidth: 1, borderColor: C.borderInput, borderRadius: 8, height: 42, textAlign: "center", fontSize: 16, color: C.text },
  tcStaff: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 10 },
  tcRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingLeft: 8 },

  btnSm: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  acceptBtn: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, justifyContent: "center" },
  acceptBtnSm: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  declineBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, justifyContent: "center" },
  empty: { textAlign: "center", color: C.text2, paddingVertical: 18 },
  shiftRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  shiftName: { fontWeight: "500", color: C.text },
  linkTrade: { color: C.accent, fontWeight: "600", fontSize: 13, paddingVertical: 2 },
  linkSick: { color: C.error, fontWeight: "600", fontSize: 13, paddingVertical: 2 },
  linkDrop: { color: C.warning, fontWeight: "600", fontSize: 13, paddingVertical: 2 },

  tradePanel: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 10 },
  tradeMine: { backgroundColor: C.accentSoft, color: C.brand, padding: 8, borderRadius: 8, fontSize: 13, fontWeight: "500" },
  tradeCoworker: { fontWeight: "600", color: C.text, marginBottom: 4 },
  tradeOffer: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border },
  tradeIncoming: { borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10 },
  tradeFrom: { fontWeight: "600", color: C.text, marginBottom: 6 },
  leg: { padding: 6, borderRadius: 6, marginBottom: 4 },
  tradeBtns: { flexDirection: "row", gap: 8, marginTop: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.borderInput, backgroundColor: C.surface },
  typeChipOn: { backgroundColor: C.accentSoft, borderColor: C.accent },
  typeChipText: { fontSize: 13, color: C.text2, fontWeight: "500" },
  typeChipTextOn: { color: C.accent },
  toItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, marginTop: 6 },
  toApproval: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.border },
  availRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  availDayLabel: { width: 38, fontSize: 13, fontWeight: "500", color: C.text },
  availColLabel: { flex: 1, textAlign: "center", fontSize: 12, color: C.text2, fontWeight: "500" },
  availCell: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 8 },
  notifDot: { position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 999, backgroundColor: C.error, alignItems: "center", justifyContent: "center" },
  notifDotText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  notifItem: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 2 },
  notifTitle: { fontWeight: "500", color: C.text, fontSize: 14 },
  moreItem: { paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border },
});
let styles = makeStyles(C);

function ThemeToggle({ theme, onToggle }) {
  return (
    <TouchableOpacity style={styles.themeToggle} onPress={onToggle}>
      <Text style={{ color: C.text2, fontSize: 16 }}>{theme === "dark" ? "☼" : "☾"}</Text>
    </TouchableOpacity>
  );
}

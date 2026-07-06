import React, { useEffect, useState } from "react";

// ── tiny API helper ──────────────────────────────────────────────────────────
async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // A 401 on an authenticated call means the session is dead (expired, or
  // revoked by a password reset) — return cleanly to the login screen instead
  // of surfacing random errors. Login itself sends no token, so a wrong
  // password still shows its message normally.
  // Only if the rejected token is STILL the current session — a late 401 from
  // a stale in-flight request must never wipe a freshly created session.
  if (res.status === 401 && token && localStorage.getItem("ns_token") === token) {
    localStorage.removeItem("ns_token");
    localStorage.removeItem("ns_user");
    localStorage.removeItem("ns_last_activity");
    window.location.reload();
    return new Promise(() => {}); // never resolves — page is reloading
  }
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

// Soft-tint badges (background + matching dark text), per design system.
const NEUTRAL = { bg: "#EEF1F5", fg: "#5B677A" };
const roleColors = {
  ADMIN:   { bg: "#E9EDF3", fg: "#1B3554" },
  MANAGER: { bg: "#E6F5F4", fg: "#1E7A75" },
  STAFF:   { bg: "#EEF1F5", fg: "#5B677A" },
};
const certColors = {
  RN:  { bg: "#E9EDF3", fg: "#1B3554" },
  LPN: { bg: "#E6F5F4", fg: "#1E7A75" },
  CCA: { bg: "#ECF1FB", fg: "#3A62B0" },
};
function Cert({ value }) {
  if (!value) return <span className="muted">—</span>;
  const c = certColors[value] || NEUTRAL;
  return <span className="badge sm" style={{ background: c.bg, color: c.fg }}>{value}</span>;
}
function RoleBadge({ value, sm }) {
  const c = roleColors[value] || NEUTRAL;
  return <span className={"badge" + (sm ? " sm" : "")} style={{ background: c.bg, color: c.fg }}>{value}</span>;
}

// Why a shift is open
const reasonMeta = {
  SICK:     { label: "Sick call-in", bg: "#FBEAEA", fg: "#C64545" },
  SWAP:     { label: "Dropped",      bg: "#FFF6E5", fg: "#B7842B" },
  UNFILLED: { label: "Unfilled",     bg: "#EEF1F5", fg: "#5B677A" },
};
function ReasonBadge({ value }) {
  const m = reasonMeta[value] || reasonMeta.UNFILLED;
  return <span className="badge sm" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}
const money = (n) => "$" + (n ?? 0).toLocaleString();
// Leave dates are stored date-only at UTC midnight — format in UTC so the
// displayed calendar day matches what was requested (no timezone off-by-one).
const fmtDay = (d) => new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtMins = (m) => { const h = Math.floor((m || 0) / 60), mn = (m || 0) % 60; return h ? `${h}h ${mn}m` : `${mn}m`; };
const clockTime = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const toStatusMeta = {
  PENDING: { label: "Pending", bg: "#FFF6E5", fg: "#B7842B" },
  APPROVED: { label: "Approved", bg: "#EAF6F1", fg: "#2F8F6B" },
  DENIED: { label: "Denied", bg: "#FBEAEA", fg: "#C64545" },
};
function TimeOffStatus({ value }) {
  const m = toStatusMeta[value] || toStatusMeta.PENDING;
  return <span className="badge sm" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}
const fmtDateTime = (d) => new Date(d).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function ThemeToggle({ theme, onToggle }) {
  const dark = theme === "dark";
  return (
    <button className="theme-toggle" onClick={onToggle} aria-label="Toggle light or dark theme" title={dark ? "Switch to light mode" : "Switch to dark mode"}>
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
      )}
    </button>
  );
}

// ── Login screen ──────────────────────────────────────────────────────────────
function Login({ onLogin, theme, onToggleTheme }) {
  const [mode, setMode] = useState("signin");       // "signin" | "forgot"
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devLink, setDevLink] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(next) { setMode(next); setError(""); setInfo(""); setDevLink(""); }

  async function submit(e) {
    e.preventDefault();
    setError(""); setInfo(""); setLoading(true);
    try {
      if (mode === "signin") {
        const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
        onLogin(data.token, data.user);
      } else {
        const data = await api("/api/auth/forgot-password", { method: "POST", body: { email } });
        setInfo(data.message);
        if (data.devResetUrl) setDevLink(data.devResetUrl); // dev only — no email provider yet
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-theme"><ThemeToggle theme={theme} onToggle={onToggleTheme} /></div>
      <form className="card login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">M</span>
          <h1>Mirai</h1>
        </div>
        <p className="muted">{mode === "signin" ? "Every shift, in sync" : "Enter your email and we'll send a reset link"}</p>

        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoFocus />

        {mode === "signin" && (<>
          <label>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
        </>)}

        {error && <div className="error">{error}</div>}
        {info && <div className="note">{info}</div>}
        {devLink && <div className="hint">Dev reset link: <a href={devLink}>{devLink}</a></div>}

        <button className="btn" disabled={loading}>
          {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Send reset link"}
        </button>

        <button type="button" className="link-btn" onClick={() => switchMode(mode === "signin" ? "forgot" : "signin")}>
          {mode === "signin" ? "Forgot password?" : "‹ Back to sign in"}
        </button>

        {mode === "signin" && (
          <div className="hint">
            Demo: <code>admin@demo.com</code> / <code>nurse@demo.com</code> — password <code>Password123!</code>
          </div>
        )}
      </form>
    </div>
  );
}

// Shown when the user arrives via a password-reset email link (URL has ?reset=…).
function ResetPassword({ token, theme, onToggleTheme }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  function goToSignIn() { window.location.href = "/"; } // clears ?reset= and returns to login

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-theme"><ThemeToggle theme={theme} onToggle={onToggleTheme} /></div>
      <form className="card login-card" onSubmit={submit}>
        <div className="brand"><span className="brand-mark">M</span><h1>Mirai</h1></div>
        {done ? (<>
          <p className="muted">Password updated</p>
          <div className="note">Your password has been reset. You can now sign in.</div>
          <button type="button" className="btn" onClick={goToSignIn}>Go to sign in</button>
        </>) : (<>
          <p className="muted">Choose a new password</p>
          <label>New password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoFocus />
          <label>Confirm new password</label>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" />
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={loading}>{loading ? "Saving…" : "Reset password"}</button>
          <button type="button" className="link-btn" onClick={goToSignIn}>‹ Back to sign in</button>
        </>)}
      </form>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function Dashboard({ token, user, onLogout, theme, onToggleTheme }) {
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
  const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const scheduleDates = (() => {
    const out = [];
    const start = new Date(monthFirst + "T00:00:00");
    const end = new Date(monthLast + "T00:00:00");
    if (isNaN(+start) || isNaN(+end)) return out;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      out.push({ dateStr, label: `${WEEKDAY_ABBR[d.getDay()]} · ${d.toLocaleString(undefined, { month: "short" })} ${d.getDate()}` });
    }
    return out;
  })();

  // Site + month toolbar — shown on Home and in the manager "Staffing needs and
  // schedule" view (so the manager can pick what to schedule).
  const toolbar = (
    <section className="card span2 toolbar">
      <div className="toolbar-group">
        <label className="toolbar-label">{isAdmin ? "Site" : "Your site"}</label>
        <select className="select" value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={sites.length <= 1}>
          {sites.map((s) => (<option key={s.id} value={s.id}>{s.name} ({s._count.users} staff)</option>))}
        </select>
      </div>
      <div className="toolbar-group">
        <label className="toolbar-label">Month</label>
        <div className="month-nav">
          <button className="navbtn" onClick={() => shiftMonth(-1)} title="Previous month">‹</button>
          <span className="month-label">{monthName} {period.year}</span>
          <button className="navbtn" onClick={() => shiftMonth(1)} title="Next month">›</button>
        </div>
      </div>
    </section>
  );

  // Manager-only staffing-needs grid (lives in the "Staffing needs and schedule" view).
  const staffingCard = (
    <section className="card span2">
      <div className="card-head" style={{ marginBottom: 12 }}>
        <h2>Staffing needs <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {currentSite ? currentSite.name : "this site"}</span></h2>
      </div>
      <div className="sched-dates" style={{ marginTop: 0, paddingTop: 0, borderTop: "none", paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid var(--border)" }}>
        <span className="muted">Schedule these dates:</span>
        <label>From <input type="date" min={monthFirst} max={monthLast} value={schedRange.start} onChange={(e) => setSchedRange((r) => ({ ...r, start: e.target.value }))} /></label>
        <label>To <input type="date" min={schedRange.start || monthFirst} max={monthLast} value={schedRange.end} onChange={(e) => setSchedRange((r) => ({ ...r, end: e.target.value }))} /></label>
        <span className="muted" style={{ fontSize: 12 }}>(defaults to the whole month)</span>
      </div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>
        Set how many staff you need for each shift <strong>on each date</strong>, then click <strong>Generate schedule</strong> — it fills these automatically. Use <strong>0</strong> if a role isn't needed, or <strong>Copy to all days</strong> to apply the first date to the whole month.
      </p>
      <table className="tbl staffing-grid">
        <thead><tr><th>Shift</th><th>RN</th><th>LPN</th><th>CCA</th></tr></thead>
        <tbody>
          {scheduleDates.map(({ dateStr, label }, i) => (
            <React.Fragment key={dateStr}>
              <tr className="staffing-day-row">
                <td className="staffing-day" colSpan={4}>
                  {label}
                  {i === 0 && <button type="button" className="btn-ghost sm staffing-copy" onClick={() => copyStaffingToAllDays(dateStr)}>Copy to all days</button>}
                </td>
              </tr>
              {["Day", "Evening", "Night"].map((shift) => (
                <tr key={shift}>
                  <td className="staffing-shift">{shift}</td>
                  {["RN", "LPN", "CCA"].map((cert) => (
                    <td key={cert}>
                      <input type="number" min="0" max="20" className="staffing-input" value={staffingVal(dateStr, shift, cert)} onChange={(e) => setStaffingCell(dateStr, shift, cert, e.target.value)} aria-label={`${label} ${shift} ${cert} count`} />
                    </td>
                  ))}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button className="btn-ghost" style={{ width: "auto", marginTop: 0 }} onClick={saveStaffing} disabled={staffingBusy}>{staffingBusy ? "Saving…" : "Save needs"}</button>
        <button className="btn" style={{ width: "auto", marginTop: 0 }} onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate schedule"}</button>
      </div>
      {staffingMsg && <div className="note">{staffingMsg}</div>}
    </section>
  );

  // Manager-only distribution preview (per-person workload + last shift).
  const distributionCard = workload.staff.length > 0 ? (
    <section className="card span2">
      <div className="card-head">
        <h2>Distribution preview <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· review before you post</span></h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {workload.summary.totalAssigned} assigned · {workload.summary.openShifts} open · spread {workload.summary.min}–{workload.summary.max} shifts/person
        </span>
      </div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 10, fontSize: 13 }}>
        How evenly the draft is spread. Use <strong>Reassign</strong> in the schedule below to move a shift to a lighter coworker, then <strong>Post schedule</strong>.
      </p>
      <table className="tbl">
        <thead><tr><th>Staff</th><th>Cert</th><th>Shifts</th><th>Hours</th><th>Last shift</th></tr></thead>
        <tbody>
          {workload.staff.map((s) => {
            const spread = workload.summary.max !== workload.summary.min;
            const cls = spread && s.shiftCount === workload.summary.max ? "hi" : spread && s.shiftCount === workload.summary.min ? "lo" : "";
            return (
              <tr key={s.userId}>
                <td>{s.firstName} {s.lastName}</td>
                <td><Cert value={s.certification} /></td>
                <td><span className={"load-pill " + cls}>{s.shiftCount}</span></td>
                <td>{s.hours}h</td>
                <td className="muted">{s.lastShift ? fmtDateTime(s.lastShift.start) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  ) : null;

  // The schedule itself — on Home for staff (their shifts), in the scheduling
  // view for managers (with generate / post / reassign).
  const scheduleCard = (
    <section className="card span2">
      <div className="card-head">
        <h2>
          Schedule — {currentSite ? currentSite.name + " · " : ""}{monthName} {period.year}
          {isManager && schedulePeriod && (
            <span className={"sched-badge " + (schedulePeriod.status === "PUBLISHED" ? "posted" : "draft")}>
              {schedulePeriod.status === "PUBLISHED" ? "Posted" : "Draft — not visible to staff"}
            </span>
          )}
        </h2>
        {isManager && schedulePeriod && schedulePeriod.status !== "PUBLISHED" && (
          <div className="sched-actions">
            <button className="btn-accept" onClick={postSchedule}>Post schedule</button>
          </div>
        )}
      </div>

      {Array.isArray(schedule) && schedule.length > 0 ? (
        <table className="tbl">
          <thead><tr><th>Staff</th><th>Cert</th><th>Unit</th><th>Start</th><th>End</th><th></th></tr></thead>
          <tbody>
            {schedule.slice(0, 60).map((s) => {
              const mine = s.staff?.id === user.id;
              const canRelease = mine || isManager;
              return (
                <React.Fragment key={s.id}>
                <tr>
                  <td>{s.staff?.firstName} {s.staff?.lastName}{mine ? " (you)" : ""}</td>
                  <td><Cert value={s.requiredCertification} /></td>
                  <td>{s.unit?.name}</td>
                  <td>{new Date(s.startTime).toLocaleString()}</td>
                  <td>{new Date(s.endTime).toLocaleString()}</td>
                  <td className="row-actions">
                    {isManager && (
                      <button className="link-reassign" title="Swap this shift to another staff member" onClick={() => openReassign(s.id)}>{reassignFor === s.id ? "Close" : "Reassign"}</button>
                    )}
                    {mine && (
                      <button className="link-trade" title="Trade this shift with a coworker" onClick={() => openTrade(s.id)}>{tradeFor === s.id ? "Close" : "Trade"}</button>
                    )}
                    {canRelease && (
                      <>
                        {isManager && <button className="link-sick" title="Call in sick" onClick={() => releaseShift(s.id, "SICK")}>Sick</button>}
                        <button className="link-drop" title="Drop this shift to the open board" onClick={() => releaseShift(s.id, "SWAP")}>Drop</button>
                      </>
                    )}
                  </td>
                </tr>
                {reassignFor === s.id && (
                  <tr className="reassign-row">
                    <td colSpan={6}>
                      {reassignCands === null ? (
                        <span className="muted">Loading eligible coworkers…</span>
                      ) : reassignCands.length === 0 ? (
                        <span className="muted">No eligible coworker (needs a {s.requiredCertification} who is rest-safe).</span>
                      ) : (
                        <div className="reassign-list">
                          <span className="muted">Move this {s.requiredCertification} shift to:</span>
                          {reassignCands.map((c) => (
                            <button key={c.id} className="btn-accept sm" onClick={() => doReassign(s.id, c.id)}>
                              {c.name} · {c.weeklyHours}h{c.wouldBeOvertime ? " · OT" : ""}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty">
          <p>No shifts scheduled for {monthName} yet.</p>
          {isManager
            ? <p className="muted">Click “Generate schedule” to auto-assign shifts.</p>
            : <p className="muted">Your manager hasn’t published a schedule yet.</p>}
        </div>
      )}
      {scheduleMsg && <div className="note">{scheduleMsg}</div>}
      {reassignMsg && <div className="note">{reassignMsg}</div>}
    </section>
  );

  // ── Draft-schedule calendar (managers): month/week grid with drag-and-drop ──
  const CAL_SLOTS = ["Day", "Evening", "Night"];
  const ROLE_ORDER = ["RN", "LPN", "CCA"];
  const slotOf = (s) => {
    const label = s.notes ? String(s.notes).split(" · ")[0] : "";
    if (CAL_SLOTS.includes(label)) return label;
    const h = new Date(s.startTime).getHours();
    return h < 13 ? "Day" : h < 21 ? "Evening" : "Night";
  };
  // Bucket the loaded shifts by day-of-month → slot.
  const calCells = {};
  if (Array.isArray(schedule)) {
    for (const s of schedule) {
      const day = new Date(s.startTime).getDate();
      const cell = (calCells[day] = calCells[day] || { Day: [], Evening: [], Night: [] });
      cell[slotOf(s)].push(s);
    }
  }
  for (const day in calCells)
    for (const sl of CAL_SLOTS)
      calCells[day][sl].sort((a, b) =>
        (ROLE_ORDER.indexOf(a.requiredCertification) - ROLE_ORDER.indexOf(b.requiredCertification)) ||
        ((a.staff?.lastName || "~").localeCompare(b.staff?.lastName || "~")));
  // Lay the month out as weeks (Sun→Sat), padding with nulls.
  const daysInThisMonth = new Date(period.year, period.month, 0).getDate();
  const leadBlanks = new Date(period.year, period.month - 1, 1).getDay();
  const calWeeks = [];
  let wk = new Array(leadBlanks).fill(null);
  for (let d = 1; d <= daysInThisMonth; d++) {
    wk.push(d);
    if (wk.length === 7) { calWeeks.push(wk); wk = []; }
  }
  if (wk.length) { while (wk.length < 7) wk.push(null); calWeeks.push(wk); }
  const safeWeek = Math.max(0, Math.min(calWeek, calWeeks.length - 1));

  const renderChip = (shift) => {
    const role = shift.requiredCertification || "NA";
    const open = !shift.staffId || shift.status === "OPEN";
    return (
      <div
        key={shift.id}
        className={`cal-chip chip-${role}${open ? " cal-chip-open" : ""}${dropId === shift.id ? " drop-hot" : ""}${dragId === shift.id ? " dragging" : ""}`}
        draggable={!open}
        onDragStart={(e) => onChipDragStart(e, shift)}
        onDragEnd={() => { setDragId(null); setDropId(null); }}
        onDragOver={(e) => { e.preventDefault(); if (dropId !== shift.id) setDropId(shift.id); }}
        onDragLeave={() => setDropId((id) => (id === shift.id ? null : id))}
        onDrop={(e) => onChipDrop(e, shift)}
        title={open
          ? `Open ${role} ${slotOf(shift)} shift — drop someone here to fill it`
          : `${shift.staff.firstName} ${shift.staff.lastName} · ${role} · ${slotOf(shift)} — drag to swap, or onto an Open slot`}
      >
        <span className="chip-role">{role}</span>
        <span className="chip-name">{open ? "Open" : `${shift.staff.firstName} ${(shift.staff.lastName || "").charAt(0)}`}</span>
      </div>
    );
  };
  const renderCalDay = (dayNum, big) => {
    if (!dayNum) return <div className="cal-day cal-day-empty" />;
    const cell = calCells[dayNum] || { Day: [], Evening: [], Night: [] };
    const dow = new Date(period.year, period.month - 1, dayNum).toLocaleDateString(undefined, { weekday: "short" });
    return (
      <div className={`cal-day${big ? " cal-day-big" : ""}`}>
        <div className="cal-day-head"><span className="cal-daynum">{dayNum}</span>{big && <span className="cal-dow muted">{dow}</span>}</div>
        {CAL_SLOTS.map((sl) => (
          <div className="cal-slot" key={sl}>
            <span className="cal-slot-label">{sl}</span>
            <div className="cal-slot-chips">
              {cell[sl].length ? cell[sl].map(renderChip) : <span className="cal-slot-empty">·</span>}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const calendarCard = (
    <section className="card span2">
      <div className="card-head">
        <h2>
          Schedule calendar — {currentSite ? currentSite.name + " · " : ""}{monthName} {period.year}
          {schedulePeriod && (
            <span className={"sched-badge " + (schedulePeriod.status === "PUBLISHED" ? "posted" : "draft")}>
              {schedulePeriod.status === "PUBLISHED" ? "Posted" : "Draft — not visible to staff"}
            </span>
          )}
        </h2>
        <div className="sched-actions">
          <div className="cal-toggle">
            <button className={calView === "month" ? "on" : ""} onClick={() => setCalView("month")}>Month</button>
            <button className={calView === "week" ? "on" : ""} onClick={() => setCalView("week")}>Week</button>
          </div>
          <button className="btn" onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate"}</button>
          {schedulePeriod && schedulePeriod.status !== "PUBLISHED" && (
            <button className="btn-accept" onClick={postSchedule}>Post schedule</button>
          )}
        </div>
      </div>

      {(!Array.isArray(schedule) || schedule.length === 0) ? (
        <div className="empty">
          <p>No shifts for {monthName} yet.</p>
          <p className="muted">Set your staffing needs above, then click “Generate”.</p>
        </div>
      ) : (
        <>
          <div className="cal-legend">
            <span className="muted">Drag a name onto a coworker to <b>swap</b>, or onto an <b>Open</b> slot to <b>fill</b> it (their old slot then opens). Same role only; the 8-hour-rest rule still applies.</span>
            <span className="cal-legend-roles">
              <span className="chip-role chip-RN">RN</span>
              <span className="chip-role chip-LPN">LPN</span>
              <span className="chip-role chip-CCA">CCA</span>
            </span>
          </div>

          {calView === "week" && (
            <div className="cal-week-nav">
              <button className="navbtn" disabled={safeWeek <= 0} onClick={() => setCalWeek(Math.max(0, safeWeek - 1))}>‹</button>
              <span className="muted">Week {safeWeek + 1} of {calWeeks.length}</span>
              <button className="navbtn" disabled={safeWeek >= calWeeks.length - 1} onClick={() => setCalWeek(Math.min(calWeeks.length - 1, safeWeek + 1))}>›</button>
            </div>
          )}

          <div className={"cal-dow-head" + (calView === "week" ? " wide" : "")}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="cal-dow-cell muted">{d}</div>)}
          </div>

          {calView === "month" ? (
            <div className="cal-month">
              {calWeeks.flat().map((d, i) => <React.Fragment key={i}>{renderCalDay(d, false)}</React.Fragment>)}
            </div>
          ) : (
            <div className="cal-week">
              {(calWeeks[safeWeek] || []).map((d, i) => <React.Fragment key={i}>{renderCalDay(d, true)}</React.Fragment>)}
            </div>
          )}
        </>
      )}
      {scheduleMsg && <div className="note">{scheduleMsg}</div>}
    </section>
  );

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
          <div className="notif-wrap">
            <button className="theme-toggle" onClick={openNotifs} aria-label="Notifications" title="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
            </button>
            {showNotifs && (
              <div className="notif-panel">
                <div className="notif-head">Notifications</div>
                <div className="notif-list">
                  {notifs.length === 0 ? <div className="notif-empty">You're all caught up.</div> : notifs.map((n) => (
                    <div key={n.id} className={"notif-item" + (n.isRead ? "" : " unread")}>
                      <div className="notif-title">{n.title}</div>
                      <div className="notif-body">{n.body}</div>
                      <div className="notif-time">{new Date(n.createdAt).toLocaleString()}</div>
                      {(n.metadata?.kind === "TIMEOFF_REQUEST" || n.metadata?.kind === "SWAP_REQUEST") && (
                        notifActed[n.id]
                          ? <div className="notif-acted">{notifActed[n.id]}</div>
                          : <div className="notif-actions">
                              <button className="notif-accept" onClick={() => actOnNotif(n, true)}>Accept</button>
                              <button className="notif-decline" onClick={() => actOnNotif(n, false)}>Decline</button>
                            </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
        {view === "myspace" && (
          <section className="card span2">
            <h2>My Space</h2>
            <div className="myspace-links">
              {(isManager
                ? [{ label: "Staffing needs and schedule", sub: "Set needs, generate, balance & post the schedule", v: "scheduling" }, ...(isAdmin ? [{ label: "My Staff", sub: "Profiles, files, pay & reliability", v: "mystaff" }] : []), { label: "Live attendance", sub: "See who's clocked in right now", v: "attendance" }, { label: "Timecards", sub: "Review & approve staff hours", v: "factimecards" }, { label: "Time-off approvals", sub: "Review staff leave requests", v: "approvals" }]
                : [{ label: "Request time off", sub: "Submit and track leave requests", v: "timeoff" }, { label: "My availability", sub: "Set the shifts you can work", v: "availability" }, { label: "My timecard", sub: "Your clock-in history & hours", v: "timecard" }, { label: "Certification", sub: "Your licenses & expiry dates", v: "certs" }]
              ).map((it) => (
                <button key={it.v} className="myspace-link" onClick={() => setView(it.v)}>
                  <span className="myspace-link-title">{it.label}</span>
                  <span className="myspace-link-sub">{it.sub}</span>
                  <span className="myspace-link-arrow">›</span>
                </button>
              ))}
            </div>
            <div className="danger-zone">
              <div>
                <div className="danger-title">Delete account</div>
                <div className="myspace-link-sub">Erases your personal details and disables sign-in. This can't be undone.</div>
              </div>
              <button className="btn-danger" onClick={deleteAccount}>Delete account</button>
            </div>
          </section>
        )}
        {view === "home" && (<>
        {/* Site + month toolbar */}
        {toolbar}

        {/* ── Overtime cost dashboard (managers/admins) ───────────────── */}
        {isManager && cost && (
          <section className="card span2 cost-card">
            <div className="card-head">
              <h2>Labor cost — {monthName} {period.year}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {cost.overtimeCost > 0
                  ? <span className="cost-alert">{money(cost.overtimeCost)} in overtime</span>
                  : <span className="cost-ok">No overtime</span>}
                {isAdmin && <button className="btn" style={{ width: "auto", marginTop: 0, height: 40, padding: "0 16px" }} onClick={downloadTimesheet}>Export payroll</button>}
              </div>
            </div>
            <div className="cost-grid">
              <div className="cost-box"><div className="cost-num">{money(cost.totalCost)}</div><div className="cost-label">Projected total</div></div>
              <div className="cost-box"><div className={"cost-num " + (cost.overtimeCost > 0 ? "warn" : "good")}>{money(cost.overtimeCost)}</div><div className="cost-label">Overtime cost</div></div>
              <div className="cost-box"><div className="cost-num">{cost.overtimeHours}h</div><div className="cost-label">Overtime hours</div></div>
              <div className="cost-box"><div className="cost-num">{cost.staffOnOvertime}</div><div className="cost-label">Staff in overtime</div></div>
              <div className="cost-box"><div className="cost-num">{cost.openShifts}</div><div className="cost-label">Unfilled (lost coverage)</div></div>
            </div>
            <div className="cost-bycert">
              {Object.entries(cost.byCert || {}).map(([c, v]) => (
                <span key={c} className="chip"><Cert value={c} /> {money(v.cost)} · {v.hours}h</span>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <h2>Welcome, {user.firstName}</h2>
          <p className="muted">
            You're signed in as <strong>{user.role}</strong>
            {isAdmin ? <> · managing <strong>{sites.length}</strong> site{sites.length === 1 ? "" : "s"}</> : null}.
          </p>
          <div className="stat-row">
            <div className="stat"><div className="stat-num">{team.length}</div><div className="stat-label">Staff{currentSite ? ` · ${currentSite.name.split(" ")[0]}` : ""}</div></div>
            <div className="stat"><div className="stat-num">{Array.isArray(schedule) ? schedule.length : 0}</div><div className="stat-label">Shifts ({monthName})</div></div>
          </div>
        </section>

        {!isManager && (
          <section className="card clock-card">
            <h2>Time clock</h2>
            <div className="clock-row">
              <div>
                <div className={"clock-state " + (clock.clockedIn ? "on" : "off")}>{clock.clockedIn ? "Clocked in" : "Clocked out"}</div>
                <div className="muted">{clock.clockedIn ? `Since ${clockTime(clock.since)} · ` : ""}Today: {fmtMins(clock.todayMinutes)}</div>
              </div>
              <button className={"btn clock-btn " + (clock.clockedIn ? "out" : "in")} onClick={toggleClock}>{clock.clockedIn ? "Clock out" : "Clock in"}</button>
            </div>
          </section>
        )}

        <section className="card">
          <h2>Team</h2>
          <table className="tbl team-tbl">
            <thead><tr><th>Name</th><th>Positions</th>{isAdmin && <th>Rate</th>}<th>Role</th></tr></thead>
            <tbody>
              {team.map((u) => (
                <tr key={u.id}>
                  <td>{u.firstName} {u.lastName}</td>
                  <td><Cert value={u.certification} /></td>
                  {isAdmin && <td className="muted">{u.hourlyRate ? `$${u.hourlyRate}/h` : "—"}</td>}
                  <td><RoleBadge value={u.role} sm /></td>
                </tr>
              ))}
              {team.length === 0 && <tr><td colSpan={isAdmin ? 4 : 3} className="muted">No staff yet</td></tr>}
            </tbody>
          </table>
        </section>
        </>)}

        {/* ── Time off: staff request form + own requests ─────────────── */}
        {view === "timeoff" && !isManager && (
          <section className="card">
            <h2>Request time off</h2>
            <div className="to-form">
              <div className="to-row">
                <label>From<input type="date" value={toForm.startDate} onChange={(e) => setToForm({ ...toForm, startDate: e.target.value })} /></label>
                <label>To<input type="date" value={toForm.endDate} onChange={(e) => setToForm({ ...toForm, endDate: e.target.value })} /></label>
              </div>
              <label>Type
                <select value={toForm.type} onChange={(e) => setToForm({ ...toForm, type: e.target.value })}>
                  <option value="VACATION">Vacation</option><option value="SICK">Sick</option>
                  <option value="PERSONAL">Personal</option><option value="UNPAID">Unpaid</option>
                </select>
              </label>
              <label>Reason (optional)<input type="text" value={toForm.reason} onChange={(e) => setToForm({ ...toForm, reason: e.target.value })} placeholder="e.g. Family trip" /></label>
              <button className="btn" onClick={submitTimeoff}>Submit request</button>
              {toMsg && <div className="note">{toMsg}</div>}
            </div>
            <div className="to-list">
              {timeoff.length === 0 ? <p className="muted">No requests yet.</p> : timeoff.map((t) => (
                <div key={t.id} className="to-item">
                  <span>{fmtDay(t.startDate)} – {fmtDay(t.endDate)} · <span className="muted">{t.type.toLowerCase()}</span></span>
                  <TimeOffStatus value={t.status} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Availability grid (staff) ───────────────────────────────── */}
        {view === "availability" && !isManager && (
          <section className="card">
            <h2>My availability</h2>
            <p className="muted" style={{ marginTop: -8, marginBottom: 14, fontSize: 13 }}>Tap a slot to mark yourself off — the scheduler won't assign you there.</p>
            <table className="tbl avail-grid">
              <thead><tr><th></th><th>Day</th><th>Evening</th><th>Night</th></tr></thead>
              <tbody>
                {[["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]].map(([label, dow]) => (
                  <tr key={dow}>
                    <td className="avail-day">{label}</td>
                    {["Day", "Evening", "Night"].map((s) => {
                      const off = isBlocked(dow, s);
                      return <td key={s}><button className={"avail-cell " + (off ? "off" : "on")} onClick={() => toggleAvail(dow, s)}>{off ? "Off" : "Available"}</button></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── Time off: manager approvals ─────────────────────────────── */}
        {view === "approvals" && isManager && (
          <section className="card">
            <h2>Time-off approvals {timeoff.filter((t) => t.status === "PENDING").length ? `(${timeoff.filter((t) => t.status === "PENDING").length})` : ""}</h2>
            {timeoff.filter((t) => t.status === "PENDING").length === 0 ? (
              <p className="muted">No pending requests.</p>
            ) : timeoff.filter((t) => t.status === "PENDING").map((t) => (
              <div key={t.id} className="to-approval">
                <div>
                  <div className="to-name">{t.user.firstName} {t.user.lastName} <Cert value={t.user.certification} /></div>
                  <div className="muted">{fmtDay(t.startDate)} – {fmtDay(t.endDate)} · {t.type.toLowerCase()}{t.reason ? ` · "${t.reason}"` : ""}</div>
                </div>
                <div className="to-actions">
                  <button className="btn-accept" onClick={() => respondTimeoff(t.id, true)}>Approve</button>
                  <button className="btn-ghost" onClick={() => respondTimeoff(t.id, false)}>Deny</button>
                </div>
              </div>
            ))}
            {toMsg && <div className="note">{toMsg}</div>}
          </section>
        )}

        {/* ── Manager: live attendance ────────────────────────────────── */}
        {view === "attendance" && isManager && (
          <section className="card span2">
            <div className="att-head">
              <h2 style={{ margin: 0 }}>Who's clocked in <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {attendance.onNow.length} of {attendance.totalStaff} staff on now</span></h2>
              <button className="btn-ghost" onClick={loadAttendance}>Refresh</button>
            </div>
            {attendance.onNow.length === 0 ? (
              <p className="muted">No one is clocked in right now.</p>
            ) : (
              <div className="att-list">
                {attendance.onNow.map((p) => (
                  <div key={p.id} className="att-item">
                    <div className="att-who">
                      <span className="att-dot" />
                      <span className="att-name">{p.firstName} {p.lastName}</span>
                      <Cert value={p.certification} />
                    </div>
                    <div className="muted">On since {clockTime(p.since)} · {fmtMins(p.minutes)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Manager: facility timecards + approval ──────────────────── */}
        {view === "factimecards" && isManager && (
          <section className="card span2">
            <h2>Timecards <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· last {facTimecards.rangeDays} days</span></h2>
            {tcMsg && <div className="note">{tcMsg}</div>}
            {facTimecards.staff.length === 0 ? (
              <p className="muted">No clock-ins in this period.</p>
            ) : (
              facTimecards.staff.map((s) => (
                <div key={s.id} className="ftc-staff">
                  <div className="ftc-staff-head">
                    <span className="att-name">{s.firstName} {s.lastName}</span> <Cert value={s.certification} />
                    <span className="muted"> · {fmtMins(s.totalMinutes)} · {s.pendingDays ? `${s.pendingDays} to approve` : "all approved"}</span>
                  </div>
                  {s.days.map((d) => {
                    const key = `${s.id}|${d.date}`;
                    return (
                      <div key={d.date} className="ftc-day">
                        <div className="ftc-day-info">
                          <span className="tc-date">{fmtDay(d.date)}</span>
                          <span className="muted"> · {fmtMins(d.minutes)}</span>
                          {d.missedPunch && <span className="badge sm pill-warn">Missed punch</span>}
                          <span className="ftc-sessions">{d.sessions.map((ss, i) => (
                            <span key={i} className="muted">{clockTime(ss.in)}–{ss.out ? clockTime(ss.out) : "…"}</span>
                          ))}</span>
                        </div>
                        <div className="ftc-day-actions">
                          {d.approval ? (
                            <><span className="badge sm pill-ok">Approved</span><button className="btn-ghost sm" onClick={() => reopenDay(s.id, d.date)}>Reopen</button></>
                          ) : (
                            <button className="btn-accept sm" onClick={() => approveDay(s.id, d.date)}>Approve</button>
                          )}
                          {d.missedPunch && <button className="btn-ghost sm" onClick={() => { setFixFor(fixFor === key ? null : key); setFixTime(""); setTcMsg(""); }}>Fix</button>}
                        </div>
                        {fixFor === key && (
                          <div className="ftc-fix">
                            <span className="muted">Add the missing clock-out:</span>
                            <input type="datetime-local" value={fixTime} onChange={(e) => setFixTime(e.target.value)} />
                            <button className="btn sm" onClick={() => correctPunch(s.id)}>Save</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </section>
        )}

        {view === "timecard" && !isManager && (
          <section className="card span2">
            <h2>My timecard {timecard ? <span className="muted" style={{ fontWeight: 400, fontSize: "14px" }}>· {fmtMins(timecard.totalMinutes)} in last 14 days</span> : ""}</h2>
            {(!timecard || timecard.days.length === 0) ? (
              <p className="muted">No clock-ins yet. Use the Time clock on your dashboard.</p>
            ) : (
              timecard.days.map((d) => (
                <div key={d.date} className="tc-day">
                  <div className="tc-date">{fmtDay(d.date)}<span className="muted"> · {fmtMins(d.minutes)}</span></div>
                  <div className="tc-sessions">
                    {d.sessions.map((s, i) => (
                      <span key={i} className="muted">{clockTime(s.in)} – {s.out ? clockTime(s.out) : "in progress"}</span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {view === "certs" && !isManager && (
          <section className="card span2">
            <h2>Certification <span className="muted" style={{ fontWeight: 400, fontSize: "14px" }}>· your licenses &amp; expiry dates</span></h2>
            <div className="cert-form">
              <input type="text" placeholder="Name (e.g. RN License, CPR)" value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} />
              <input type="text" placeholder="Number (optional)" value={certForm.number} onChange={(e) => setCertForm({ ...certForm, number: e.target.value })} />
              <label className="cert-exp">Expiry <input type="date" value={certForm.expiryDate} onChange={(e) => setCertForm({ ...certForm, expiryDate: e.target.value })} /></label>
              <button className="btn-accept" onClick={addCert}>Add</button>
            </div>
            {certMsg && <div className="note">{certMsg}</div>}
            {certs.length === 0 ? (
              <p className="muted" style={{ marginTop: 12 }}>No certifications yet — add your licenses and credentials above.</p>
            ) : certs.map((c) => {
              const st = certStatus(c.expiryDate);
              return (
                <div key={c.id} className="cert-item">
                  <div>
                    <div className="cert-name">{c.name}{c.number ? <span className="muted"> · {c.number}</span> : ""}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{c.expiryDate ? `Expires ${fmtDay(c.expiryDate)}` : "No expiry date"}</div>
                  </div>
                  <div className="cert-actions">
                    <span className={"rel-pill " + st.cls}>{st.label}</span>
                    <button className="btn-ghost sm" onClick={() => deleteCert(c.id)}>Remove</button>
                  </div>
                </div>
              );
            })}

            {/* My own certification documents — private to me + my managers */}
            <div className="doc-head" style={{ marginTop: 18 }}>
              <h3>Documents ({myDocs.length})</h3>
              <div className="doc-actions">
                <label className="btn-accept sm doc-upload">Upload PDFs
                  <input type="file" accept="application/pdf" multiple style={{ display: "none" }} onChange={(e) => { uploadMyDocs(e.target.files); e.target.value = ""; }} />
                </label>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: -2 }}>PDF copies of your licenses or certificates. Only you and your managers can see these.</p>
            {myDocMsg && <div className="note">{myDocMsg}</div>}
            {myDocs.length === 0 ? (
              <p className="muted">No documents yet — upload PDF copies of your certifications above.</p>
            ) : (
              <div className="doc-list">
                {myDocs.map((d) => (
                  <div key={d.id} className="doc-item">
                    <span className="doc-name">{d.filename}</span>
                    <span className="muted">{Math.max(1, Math.round(d.size / 1024))} KB · {fmtDay(d.createdAt)}</span>
                    <button className="link-trade" onClick={() => downloadStaffFile(`/api/my/documents/${d.id}/download`, d.filename)}>Download</button>
                    <button className="link-drop" onClick={() => deleteMyDoc(d.id)}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Staffing needs and schedule (managers/admins) ───────────── */}
        {view === "scheduling" && isManager && (<>
          {toolbar}
          {staffingCard}
          {distributionCard}
          {calendarCard}
        </>)}

        {/* ── My Staff (admin): profiles, files, pay, reliability ─────── */}
        {view === "mystaff" && isAdmin && (<>
          {toolbar}
          <section className="card span2">
            <div className="card-head">
              <h2>My Staff <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {currentSite ? currentSite.name : "this site"}</span></h2>
              <span className="muted" style={{ fontSize: 13 }}>Tap a person for details &amp; files</span>
            </div>
            {roster.length === 0 ? <p className="muted">No staff at this site.</p> : (
              <table className="tbl staff-tbl">
                <thead><tr><th>Name</th><th>Cert</th><th>Shifts</th><th>Attendance</th><th>Punctuality</th><th>Pay ({monthName})</th><th>Reliability</th><th>Files</th></tr></thead>
                <tbody>
                  {roster.map((s) => (
                    <React.Fragment key={s.userId}>
                      <tr className="staff-row" onClick={() => expandStaff(s.userId)}>
                        <td><strong>{s.firstName} {s.lastName}</strong></td>
                        <td><Cert value={s.certification} /></td>
                        <td>{s.shiftsWorked}<span className="muted">/{s.shiftsScheduledPast}</span></td>
                        <td>{s.attendancePct == null ? "—" : s.attendancePct + "%"}</td>
                        <td>{s.punctualityPct == null ? "—" : s.punctualityPct + "%"}</td>
                        <td>${s.pay.toLocaleString()}</td>
                        <td><span className={"rel-pill " + relClass(s.reliabilityLabel)}>{s.reliabilityLabel}{s.reliabilityScore != null ? ` · ${s.reliabilityScore}` : ""}</span></td>
                        <td>{s.documentCount}</td>
                      </tr>
                      {staffExpanded === s.userId && (
                        <tr className="staff-detail">
                          <td colSpan={8}>
                            <div className="staff-detail-grid">
                              <div className="sd-box"><div className="sd-num">{s.shiftsWorked}<span className="muted">/{s.shiftsScheduledPast}</span></div><div className="sd-label">Shifts worked / scheduled</div></div>
                              <div className="sd-box"><div className="sd-num">{s.attendancePct == null ? "—" : s.attendancePct + "%"}</div><div className="sd-label">Attendance</div></div>
                              <div className="sd-box"><div className="sd-num">{s.punctualityPct == null ? "—" : s.punctualityPct + "%"}</div><div className="sd-label">On-time · {s.lateCount} late</div></div>
                              <div className="sd-box"><div className="sd-num">{s.callIns}</div><div className="sd-label">Call-ins (sick)</div></div>
                              <div className="sd-box"><div className="sd-num">${s.pay.toLocaleString()}</div><div className="sd-label">{monthName} pay · {s.payHours}h</div></div>
                              <div className="sd-box"><div className="sd-num">{s.reliabilityScore == null ? "—" : s.reliabilityScore}</div><div className="sd-label">Reliability · {s.reliabilityLabel}</div></div>
                            </div>

                            <div className="doc-head"><h3>Certifications ({staffCerts.length})</h3></div>
                            {staffCerts.length === 0 ? (
                              <p className="muted">None recorded by this staff member.</p>
                            ) : (
                              <div className="doc-list">
                                {staffCerts.map((c) => {
                                  const st = certStatus(c.expiryDate);
                                  return (
                                    <div key={c.id} className="doc-item">
                                      <span className="doc-name">{c.name}{c.number ? ` · ${c.number}` : ""}</span>
                                      <span className="muted">{c.expiryDate ? `exp ${fmtDay(c.expiryDate)}` : "no expiry"}</span>
                                      <span className={"rel-pill " + st.cls}>{st.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="doc-head">
                              <h3>Documents ({staffDocs.length})</h3>
                              <div className="doc-actions">
                                <label className="btn-accept sm doc-upload">Upload PDFs
                                  <input type="file" accept="application/pdf" multiple style={{ display: "none" }} onChange={(e) => { uploadStaffDocs(s.userId, e.target.files); e.target.value = ""; }} />
                                </label>
                                {staffDocs.length > 0 && (
                                  <button className="btn sm" onClick={() => downloadStaffFile(`/api/staff/${s.userId}/documents/merged`, `${s.firstName}_${s.lastName}_documents.pdf`)}>Download all (merged)</button>
                                )}
                              </div>
                            </div>
                            {staffDocs.length === 0 ? (
                              <p className="muted">No files yet. Upload PDFs — contracts, certifications, reviews…</p>
                            ) : (
                              <div className="doc-list">
                                {staffDocs.map((d) => (
                                  <div key={d.id} className="doc-item">
                                    <span className="doc-name">{d.filename}</span>
                                    <span className={"rel-pill " + (d.source === "STAFF" ? "rel-ok" : "rel-none")} title={d.source === "STAFF" ? "Uploaded by the staff member" : "Uploaded by an admin"}>{d.source === "STAFF" ? "Staff" : "Admin"}</span>
                                    <span className="muted">{Math.max(1, Math.round(d.size / 1024))} KB · {fmtDay(d.createdAt)}</span>
                                    <button className="link-trade" onClick={() => downloadStaffFile(`/api/staff/${s.userId}/documents/${d.id}/download`, d.filename)}>Download</button>
                                    <button className="link-drop" onClick={() => deleteStaffDoc(s.userId, d.id)}>Delete</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {staffMsg && <div className="note">{staffMsg}</div>}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>)}

        {view === "home" && (<>
        {/* Staff see their own schedule on Home. Managers manage staffing + the
            full schedule in My Space → "Staffing needs and schedule". */}
        {!isManager && scheduleCard}

        {/* ── Shift trade: propose panel ──────────────────────────────── */}
        {tradeFor && (
          <section className="card span2">
            <h2>Trade a shift</h2>
            {!tradeOpts ? (
              <p className="muted">Loading coworkers…</p>
            ) : (
              <>
                <div className="trade-mine">
                  <span className="muted">You give up:</span>{" "}
                  <Cert value={tradeOpts.myShift.requiredCertification} />{" "}
                  <strong>{fmtDateTime(tradeOpts.myShift.startTime)} – {fmtTime(tradeOpts.myShift.endTime)}</strong>{" "}
                  <span className="muted">· {tradeOpts.myShift.unit}</span>
                </div>
                {tradeOpts.coworkers.length === 0 ? (
                  <p className="muted" style={{ marginTop: 10 }}>No coworkers have a rest-compatible shift to trade for this one.</p>
                ) : (
                  tradeOpts.coworkers.map((c) => (
                    <div key={c.id} className="trade-coworker">
                      <div className="trade-coworker-name">{c.name} <Cert value={c.certification} /></div>
                      {c.shifts.map((s) => (
                        <div key={s.id} className="trade-offer">
                          <span className="muted">You'd work instead:</span>{" "}
                          <strong>{fmtDateTime(s.startTime)} – {fmtTime(s.endTime)}</strong>{" "}
                          <span className="muted">· {s.unit?.name}</span>
                          <button className="btn-accept" style={{ marginLeft: "auto" }} onClick={() => proposeTrade(s.id)}>Request trade</button>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </>
            )}
            {tradeMsg && <div className="note">{tradeMsg}</div>}
          </section>
        )}

        {/* ── Incoming trade requests ─────────────────────────────────── */}
        {swaps.incoming.length > 0 && (
          <section className="card span2">
            <h2>Incoming trade requests ({swaps.incoming.length})</h2>
            {swaps.incoming.map((sw) => (
              <div key={sw.id} className="trade-incoming">
                <div className="trade-incoming-info">
                  <div className="trade-from">{sw.requestor.firstName} {sw.requestor.lastName} wants to trade</div>
                  <div className="trade-legs">
                    <span className="leg leg-get">You'd work: <strong>{fmtDateTime(sw.originalShift.startTime)} – {fmtTime(sw.originalShift.endTime)}</strong> · {sw.originalShift.unit?.name}</span>
                    <span className="leg leg-give">They'd take: <strong>{fmtDateTime(sw.offeredShift.startTime)} – {fmtTime(sw.offeredShift.endTime)}</strong> · {sw.offeredShift.unit?.name}</span>
                  </div>
                </div>
                <div className="trade-actions">
                  <button className="btn-accept" onClick={() => respondSwap(sw.id, true)}>Accept</button>
                  <button className="btn-ghost" onClick={() => respondSwap(sw.id, false)}>Decline</button>
                </div>
              </div>
            ))}
            {tradeMsg && <div className="note">{tradeMsg}</div>}
          </section>
        )}

        {/* ── Open Shifts board ───────────────────────────────────────── */}
        <section className="card span2">
          <div className="card-head">
            <h2>Open shifts {openShifts.length ? `(${openShifts.length})` : ""}</h2>
            <div className="cert-chips">
              {["RN", "LPN", "CCA"].map((c) => {
                const n = openShifts.filter((s) => s.requiredCertification === c).length;
                return n ? <span key={c} className="chip"><Cert value={c} /> {n}</span> : null;
              })}
            </div>
          </div>

          {openShifts.length === 0 ? (
            <div className="empty"><p>Full coverage — no open shifts for {monthName}.</p></div>
          ) : (
            <div className="open-list">
              {openShifts.slice(0, 25).map((s) => (
                <div key={s.id} className="open-row">
                  <div className="open-main">
                    <div className="open-info">
                      <Cert value={s.requiredCertification} />
                      <ReasonBadge value={s.openReason} />
                      <span className="open-when">
                        {new Date(s.startTime).toLocaleDateString()} ·{" "}
                        {new Date(s.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="muted">{s.unit?.name}</span>
                    </div>
                    {isManager ? (
                      <button className="btn-ghost" onClick={() => viewCandidates(s.id)}>
                        {expanded === s.id ? "Hide" : "Find staff ▾"}
                      </button>
                    ) : (
                      <button className="btn-accept" onClick={() => acceptShift(s.id)}>Accept</button>
                    )}
                  </div>

                  {expanded === s.id && (
                    <div className="cand-panel">
                      {candidates.length === 0 ? (
                        <span className="muted">No eligible {s.requiredCertification} available (rest / weekly-cap limits).</span>
                      ) : (
                        candidates.map((c, i) => (
                          <div key={c.id} className="cand-row">
                            <span className="cand-rank">{i === 0 ? "★" : i + 1}</span>
                            <span className="cand-name">{c.name}</span>
                            <span className="muted">{c.weeklyHours}h this wk</span>
                            {c.wouldBeOvertime
                              ? <span className="ot-flag">overtime{c.shiftCost != null ? ` · $${c.shiftCost}` : ""}</span>
                              : <span className="ok-flag">no overtime{c.shiftCost != null ? ` · $${c.shiftCost}` : ""}</span>}
                            <button className="btn-accept" onClick={() => fillShift(s.id, c.id)}>Assign</button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
              {openShifts.length > 25 && (
                <div className="muted open-more">+ {openShifts.length - 25} more open shifts…</div>
              )}
            </div>
          )}
          {openMsg && <div className="note">{openMsg}</div>}
        </section>

        {/* ── Audit trail / compliance log ────────────────────────────── */}
        {isManager && (
          <section className="card span2">
            <h2>Audit trail <span className="muted" style={{ fontWeight: 400, fontSize: "13px" }}>· compliance log</span></h2>
            {audit.length === 0 ? (
              <div className="empty"><p className="muted">No recorded activity yet. Actions like generating, assigning, accepting, and sick call-ins are logged here.</p></div>
            ) : (
              <div className="audit-list">
                {audit.map((a) => (
                  <div key={a.id} className="audit-row">
                    <span className="audit-tag">{a.action.replace(/_/g, " ")}</span>
                    <span className="audit-summary">{a.summary}</span>
                    <span className="audit-meta">{a.actorName} · {new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        </>)}
      </main>

      <nav className="bottom-bar">
        <button className={"bottom-item" + (view === "home" ? " active" : "")} onClick={() => { setView("home"); setMoreOpen(false); }}>Home</button>
        <button className={"bottom-item" + (view !== "home" ? " active" : "")} onClick={() => setView("myspace")}>My Space</button>
      </nav>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const IDLE_MS = 7 * 60 * 1000; // auto sign-out after 7 minutes of inactivity
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem("ns_token") || "";
    const last = Number(localStorage.getItem("ns_last_activity") || 0);
    if (t && last && Date.now() - last > IDLE_MS) {  // idle too long since last use → require re-login
      localStorage.removeItem("ns_token");
      localStorage.removeItem("ns_user");
      return "";
    }
    return t;
  });
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ns_user") || "null"); } catch { return null; }
  });

  // Theme: saved choice, else follow the OS on first visit.
  const [theme, setTheme] = useState(() =>
    localStorage.getItem("ns_theme") ||
    (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ns_theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  function handleLogin(t, u) {
    localStorage.setItem("ns_token", t);
    localStorage.setItem("ns_user", JSON.stringify(u));
    localStorage.setItem("ns_last_activity", String(Date.now()));
    setToken(t);
    setUser(u);
  }
  function handleLogout() {
    localStorage.removeItem("ns_token");
    localStorage.removeItem("ns_user");
    setToken("");
    setUser(null);
  }

  // Auto sign-out after 7 minutes of inactivity (security). Any interaction
  // resets the timer; last-activity is also persisted so a tab reopened after
  // the window is sent back to the login screen.
  useEffect(() => {
    if (!token) return;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = setInterval(() => {
      localStorage.setItem("ns_last_activity", String(last));
      if (Date.now() - last > IDLE_MS) handleLogout();
    }, 15000);
    return () => { clearInterval(iv); events.forEach((e) => window.removeEventListener(e, bump)); };
  }, [token]);

  // A password-reset email link lands here as /?reset=<token> — show the reset
  // screen even when signed out (and regardless of any stale session).
  const resetToken = new URLSearchParams(window.location.search).get("reset");
  if (resetToken) return <ResetPassword token={resetToken} theme={theme} onToggleTheme={toggleTheme} />;

  if (!token || !user) return <Login onLogin={handleLogin} theme={theme} onToggleTheme={toggleTheme} />;
  return <Dashboard token={token} user={user} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />;
}

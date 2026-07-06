import React, { useEffect, useState } from "react";
import { Login, ResetPassword } from "./screens/Auth";
import { Dashboard } from "./Dashboard";

// ── Root ──────────────────────────────────────────────────────────────────────
// Session (token + user), theme, and the 7-minute idle sign-out. Everything
// signed-in lives in Dashboard.jsx; the screens are in screens/.
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

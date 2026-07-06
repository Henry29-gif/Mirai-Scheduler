import React, { useState, useEffect, useRef } from "react";
import { View, ActivityIndicator, StatusBar, Appearance, AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { setOnSessionExpired } from "./src/api";
import { C, styles, applyTheme } from "./src/theme";
import { LoginScreen } from "./src/screens/LoginScreen";
import { DashboardScreen } from "./src/screens/Dashboard";

// ── Root ──────────────────────────────────────────────────────────────────────
// Theme, secure-store session persistence, and the 7-minute idle sign-out.
// Everything signed-in lives in src/screens/Dashboard.js.
export default function App() {
  const [auth, setAuth] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [theme, setTheme] = useState(Appearance.getColorScheme() === "dark" ? "dark" : "light");
  // Recompute the active palette + stylesheet whenever the theme changes —
  // src/theme.js swaps its live `C`/`styles` bindings, which every screen reads.
  applyTheme(theme);
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
  // Bounce dead sessions to login — but only when the rejected token is still
  // the CURRENT one (a late 401 from a stale request must not kill a new session).
  setOnSessionExpired((badToken) => { if (auth && badToken === auth.token) signOut(); });

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

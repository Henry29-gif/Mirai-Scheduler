import React, { useState } from "react";
import { api } from "../api";
import { ThemeToggle } from "../ui";

// ── Login screen ──────────────────────────────────────────────────────────────
export function Login({ onLogin, theme, onToggleTheme }) {
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
export function ResetPassword({ token, theme, onToggleTheme }) {
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

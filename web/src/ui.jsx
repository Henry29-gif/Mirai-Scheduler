import React from "react";

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
export function Cert({ value }) {
  if (!value) return <span className="muted">—</span>;
  const c = certColors[value] || NEUTRAL;
  return <span className="badge sm" style={{ background: c.bg, color: c.fg }}>{value}</span>;
}
export function RoleBadge({ value, sm }) {
  const c = roleColors[value] || NEUTRAL;
  return <span className={"badge" + (sm ? " sm" : "")} style={{ background: c.bg, color: c.fg }}>{value}</span>;
}

// Why a shift is open
const reasonMeta = {
  SICK:     { label: "Sick call-in", bg: "#FBEAEA", fg: "#C64545" },
  SWAP:     { label: "Dropped",      bg: "#FFF6E5", fg: "#B7842B" },
  UNFILLED: { label: "Unfilled",     bg: "#EEF1F5", fg: "#5B677A" },
};
export function ReasonBadge({ value }) {
  const m = reasonMeta[value] || reasonMeta.UNFILLED;
  return <span className="badge sm" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

const toStatusMeta = {
  PENDING: { label: "Pending", bg: "#FFF6E5", fg: "#B7842B" },
  APPROVED: { label: "Approved", bg: "#EAF6F1", fg: "#2F8F6B" },
  DENIED: { label: "Denied", bg: "#FBEAEA", fg: "#C64545" },
};
export function TimeOffStatus({ value }) {
  const m = toStatusMeta[value] || toStatusMeta.PENDING;
  return <span className="badge sm" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

export function ThemeToggle({ theme, onToggle }) {
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

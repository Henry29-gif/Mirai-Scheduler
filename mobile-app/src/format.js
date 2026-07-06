// ── shared formatting helpers ────────────────────────────────────────────────
export const fmtT = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const fmtD = (d) => new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
// Leave dates are date-only at UTC midnight — format in UTC (no off-by-one).
export const fmtDay = (d) => new Date(d).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });
export const fmtMins = (m) => { const h = Math.floor((m || 0) / 60), mn = (m || 0) % 60; return h ? `${h}h ${mn}m` : `${mn}m`; };
export const TO_STATUS = { PENDING: { bg: "#FFF6E5", fg: "#B7842B" }, APPROVED: { bg: "#EAF6F1", fg: "#2F8F6B" }, DENIED: { bg: "#FBEAEA", fg: "#C64545" } };

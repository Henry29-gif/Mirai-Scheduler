// ── shared formatting helpers ────────────────────────────────────────────────
export const money = (n) => "$" + (n ?? 0).toLocaleString();
// Leave dates are stored date-only at UTC midnight — format in UTC so the
// displayed calendar day matches what was requested (no timezone off-by-one).
export const fmtDay = (d) => new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const fmtMins = (m) => { const h = Math.floor((m || 0) / 60), mn = (m || 0) % 60; return h ? `${h}h ${mn}m` : `${mn}m`; };
export const clockTime = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (d) => new Date(d).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

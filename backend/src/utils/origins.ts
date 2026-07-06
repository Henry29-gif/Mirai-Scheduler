// Single source of truth for the browser-origin allowlist, used by BOTH the
// Express CORS middleware (app.ts) and the Socket.io handshake (socket/socket.ts).
// Falls back to local dev origins — NEVER "*" — so a missing ALLOWED_ORIGINS in
// production can only make CORS stricter, not wide open.
const DEV_ORIGINS = [
  "http://localhost:5173", // web (Vite)
  "http://localhost:8081", // Expo Metro
  "http://localhost:8082", // Expo web preview
  "http://localhost:3000",
];

export function allowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim()) // tolerate "https://a.com, https://b.com"
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEV_ORIGINS;
}

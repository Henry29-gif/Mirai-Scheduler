// API base URL — set per build via the EXPO_PUBLIC_API_URL env var (see
// .env.example + eas.json). SDK 54 inlines EXPO_PUBLIC_* at build time; it must
// be referenced with dot notation (process.env.EXPO_PUBLIC_API_URL) to inline.
// Production builds MUST point at the hosted HTTPS API — never an http:// LAN IP
// (Apple ATS / Google reject it, and a phone off your Wi-Fi can't reach it).
// The fallback is local dev only (your PC's Wi-Fi address, phone on same network).
export const API = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.109:4000";

// Set by the root component to its signOut — called when the server says a
// session is dead (401 on an authenticated call: expired or revoked token).
let onSessionExpired = () => {};
export function setOnSessionExpired(fn) { onSessionExpired = fn; }

export async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) onSessionExpired(token); // login sends no token, so bad passwords are unaffected
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

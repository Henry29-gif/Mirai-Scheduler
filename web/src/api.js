// ── tiny API helper ──────────────────────────────────────────────────────────
export async function api(path, { method = "GET", body, token } = {}) {
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

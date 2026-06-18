const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";
let _token: string | null = null;
export function setAuthToken(t: string | null) { _token = t; }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(_token ? { Authorization: `Bearer ${_token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data as T;
}

export const api = {
  login:           (email: string, password: string) => request<{ token: string; user: any }>("POST", "/auth/login", { email, password }),
  getSchedule:     (month: number, year: number)     => request<any>("GET", `/schedules?month=${month}&year=${year}`),
  generateSchedule:(month: number, year: number)     => request<any>("POST", "/schedules/generate", { month, year }),
  publishSchedule: (id: string)                      => request<any>("PATCH", `/schedules/${id}/publish`, {}),
  clockIn:         (shiftId: string, lat?: number, lng?: number) => request<any>("POST", "/clock", { shiftId, event: "CLOCK_IN", latitude: lat, longitude: lng }),
  clockOut:        (shiftId: string, lat?: number, lng?: number) => request<any>("POST", "/clock", { shiftId, event: "CLOCK_OUT", latitude: lat, longitude: lng }),
  requestSwap:     (origId: string, offeredId: string, targetId: string, msg?: string) => request<any>("POST", "/swaps", { originalShiftId: origId, offeredShiftId: offeredId, targetId, message: msg }),
  approveSwap:     (id: string)       => request<any>("PATCH", `/swaps/${id}/approve`, {}),
  rejectSwap:      (id: string)       => request<any>("PATCH", `/swaps/${id}/reject`, {}),
  reportCallIn:    (shiftId: string, reason?: string) => request<any>("POST", "/call-in", { shiftId, reason }),
  getNotifications:()                 => request<any[]>("GET", "/notifications"),
};

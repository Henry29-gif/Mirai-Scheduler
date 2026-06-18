# NurseScheduler

A nursing-home **workforce-management app** (web + mobile) for shift scheduling, staff self-service, and compliance — a healthcare-specialized alternative to Homebase. Built with a clinical-grade auto-scheduler that enforces certifications, rest rules, overtime caps, approved leave, and personal availability.

> **For the next work session:** this README + [`PROJECT-STATE.md`](PROJECT-STATE.md) (live status) + [`START-HERE.md`](START-HERE.md) (how to launch) are the full context. Read all three.

---

## What it does (implemented & working)

**Scheduling**
- Skill-aware **auto-scheduler** (RN / LPN / CCA) — fills each daily slot (Day/Evening/Night) per certification, enforcing: 8-hour rest between shifts, 40h/week overtime cap, fair distribution, **approved time-off**, and **personal availability**. Unfilled slots become **OPEN shifts**.
- **Open-shift board** with overtime-aware **ranked candidates**, one-tap **Accept** (staff), and **Assign** (manager).
- Multi-site: an **ADMIN** can switch between facilities and schedule each.

**Self-service (web + mobile)**
- **Call in sick** / **drop** a shift → posts to the open board.
- **Trade shifts** peer-to-peer (pick a coworker, see both shift times, rest-safe options only).
- **Time-off / leave requests** → manager approves/denies → scheduler skips approved leave.
- **Availability** weekly grid (mark day/shift slots you can't work) → scheduler respects it.
- **Time clock** — clock in/out + personal **timecard** (daily hours, sessions, 14-day total).
- **In-app notifications** — bell + unread badge, 30s poll (time-off result, trade request/result, shift assigned, schedule published).

**Management**
- **Live attendance** — managers see who's clocked in right now (auto-refreshing).
- **Facility timecards** — review every staffer's worked days, **approve each day** before payroll (or reopen), with **missed-punch** flags and one-click **correction** (add the forgotten clock-out).
- **Overtime cost dashboard** + **payroll CSV export** (regular/overtime split) — *admin-only*.
- **Audit log** of every significant action.
- **Pay rates are admin-only**, enforced server-side.

**UX**
- Premium design system: Inter font, navy `#14263D` brand, single teal `#2AA6A1` accent, soft-tint badges, 8px spacing, subtle shadows.
- **Light/dark theme toggle** (web persists in localStorage; mobile follows OS by default).
- **Bottom toolbar** (Home / My Space). **My Space** is a hub page → Request time off · My availability · My timecard (staff) / Time-off approvals (manager).

---

## Architecture

| Layer | Tech | Runs on |
|---|---|---|
| **Web app** | Vite + React (`web/`) | `http://localhost:5173` |
| **Mobile app** | Expo **SDK 54** (`mobile-app/`) | Expo Go via `exp://<PC-LAN-IP>:8081` |
| **Backend API** | Node + Express + TypeScript + Prisma (`backend/`) | `http://localhost:4000` |
| **Database** | PostgreSQL 16 (Docker container `ns-postgres`) | `localhost:5432` |
| **Cache/Queue** | Redis 7 (Docker container `ns-redis`) | `localhost:6379` |
| **Auth** | JWT + bcrypt + role-based (ADMIN / MANAGER / STAFF) | — |

### ⚠️ Critical infra note — Docker runs INSIDE WSL
Docker Desktop is **broken on this machine** (its "Inference manager" crashes on the space in the Windows username). The workaround in use: a **native Docker engine inside WSL Ubuntu** (`sudo apt install docker.io`, systemd-enabled) running the `ns-postgres` / `ns-redis` containers. **Do not try to fix or use Docker Desktop.**

---

## Running it

See **[START-HERE.md](START-HERE.md)** for step-by-step. In short:
1. **Database/Redis** (in Ubuntu): `docker start ns-postgres ns-redis` (auto-start enabled).
2. **Backend:** `cd backend && npm run dev` (port 4000).
3. **Web:** `cd web && npm run dev` → open `http://localhost:5173`.
4. **Mobile:** `cd mobile-app && npx expo start --lan` → open `exp://192.168.1.109:8081` in **Expo Go** (phone on same Wi-Fi).

**After a reboot:** WSL localhost forwarding (5432/6379) flaps for ~30s. If backend login 500s with *"Can't reach database server"*, restart the two containers and wait until `Test-NetConnection 127.0.0.1 5432` and `6379` both return `True`, then start the backend.

**Demo logins** (password `Password123!` for all):
| Role | Email |
|---|---|
| Admin (all sites, sees pay) | `admin@demo.com` |
| Site manager | `manager@sunrise.demo` |
| Staff nurse (RN) | `nurse@demo.com` |

Reseed demo data: `cd backend && npm run db:seed` (wipes + recreates 3 sites, ~28 RN/LPN/CCA staff with pay rates).

---

## Project structure
```
nursing-scheduler/
├── backend/
│   ├── prisma/schema.prisma          # models: Facility, Unit, User, Shift, SwapRequest,
│   │                                 #   TimeOffRequest, AvailabilityBlock, ClockInEvent,
│   │                                 #   TimecardApproval, Notification, AuditLog
│   └── src/
│       ├── services/
│       │   ├── autoScheduler.service.ts   # core: skill/rest/cap/leave/availability
│       │   ├── audit.service.ts
│       │   └── notify.service.ts
│       └── routes/                   # schedule, shift (open board), swap (trades),
│                                     #   timeoff, availability, clock, notification,
│                                     #   facility, user
├── web/src/App.jsx + styles.css      # entire web UI
├── mobile-app/App.js                 # entire mobile UI (Expo SDK 54)
├── START-HERE.md                     # how to launch everything
├── PROJECT-STATE.md                  # live project status (auto-updated)
└── README.md                         # this file
```
> The original `frontend/` and `mobile/` folders are **incomplete dead scaffolds** from the initial zip — ignore them. The real apps are `web/` and `mobile-app/`.

---

## Roadmap

**✅ Done:** auto-scheduler, open-shift board, call-in/drop/trade, time-off, availability, notifications, multi-site, cost dashboard, payroll CSV, audit log, time clock + timecards. **Phase B:** manager **attendance view** ("who's clocked in now", live), **facility timecards** with **per-day approval** (approve / reopen before payroll), and **missed-punch detection + correction** (manager adds the forgotten punch) — all audit-logged and staff-notified.

**🔜 In progress — Phase B (Time & Attendance), remaining:**
- **Time-bank & accruals** (vacation/sick balances)
- Port the new manager attendance + timecard-approval views to the **mobile app** (web-only so far)

**Later:**
- **Phase C — HR:** seniority/hire dates, qualification expiry, wage grid, document management
- **Phase D — Comms/Reporting:** mass messaging, **real push/SMS** (needs Expo/Twilio accounts), emergency alerts, report suite + emailed delivery
- Offline mode / SMS fallback
- _Payroll integration — deferred by user_

---

## Key decisions (do not change)
- Docker runs **inside WSL**, not Docker Desktop.
- Mobile stays on **Expo SDK 54** (matches the user's Play-Store Expo Go; SDK 55/56 = "incompatible"). API base is hardcoded to the PC LAN IP in `mobile-app/App.js` (`const API`) — update if the IP changes.
- **Hourly rate / pay = admin-only**, enforced server-side (not just hidden in UI).
- Leave/availability compared by **calendar day in UTC** to avoid timezone off-by-one.
- New `web/` + `mobile-app/` are the real apps; ignore `frontend/`, `mobile/`.

---

## Notes
- No automated tests yet — verification is manual / driven through the running apps.
- SMS (Twilio) and push (Expo) are **stubbed**; in-app notifications work fully. Wire real delivery once accounts exist.
- The public demo link used during development was a temporary `loca.lt` tunnel (regenerate on demand; not persistent).

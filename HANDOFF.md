# NurseScheduler — Handoff

## Project Overview
- Nursing-home **workforce-management** app (web + mobile): scheduling, self-service, time & attendance, HR. Multi-tenant, healthcare-focused alternative to Homebase.
- Goal: production launch on **Apple App Store + Google Play**. Publisher = registered company; hosting = managed cloud (planned).
- Stack: Node + Express + TypeScript + Prisma + PostgreSQL + Redis (backend); Vite + React (web); Expo SDK 54 + React Native (mobile). JWT auth; roles ADMIN / MANAGER / STAFF.
- Location: `~/Desktop/nursing-scheduler` → `backend/`, `web/`, `mobile-app/`. Ignore dead `frontend/`, `mobile/` scaffolds.

## Current Status
- Runs end-to-end locally; 2 demo tenants seeded. Mobile has **full admin parity** with web.
- DONE (all platforms) — **staff-uploaded certification documents** (staff upload/delete own cert PDFs; admins see them; private from other staff):
  - Backend: DONE + verified — `/api/my/documents` (GET/POST/`:id/download`/DELETE) scoped to `userId` + `source="STAFF"`; admin `/api/staff/:userId/documents` GET returns the `source` field.
  - Web: DONE + verified live — Documents section in the staff Certification view (upload/list/download/delete) + a "Staff/Admin" source pill on admin My Staff doc rows. Confirmed: Nora Nurse's `certdoc.pdf` lists + downloads as staff, and shows a green "Staff" pill in admin My Staff.
  - Mobile: DONE — Documents section in the staff Certification screen (`expo-document-picker` upload, `expo-file-system/legacy` download + `expo-sharing`, delete) + a "Staff/Admin" source chip on admin My Staff docs. Verified: iOS Metro bundle compiles clean and includes the new code.
- Dev servers (backend :4000, web :5173, Expo :8081) were last running; they do not survive reboot.

## Core Features
### Employee (STAFF)
- View own schedule; accept open shifts; **Trade** (rest-safe) and **Drop** to open board (no "Sick" for staff).
- Time-off requests; weekly availability grid; time clock + personal timecard; in-app notifications.
- My Space: Request time off · My availability · My timecard · **Certification** (records + expiry; own cert documents — web in progress, mobile pending).
- Forgot/reset password; delete account (erases PII).

### Admin / Manager
- Auto-scheduler (RN/LPN/CCA) honoring **staff availability** + approved time-off (verified: a staffer marked unavailable for a weekday gets zero shifts that day), manager-set per-shift counts, 8h rest (doubles allowed, no triples, no weekly cap), fair distribution; **date-range** generation. (Removing the weekly cap let understaffed sites like Lakeside fill all 7 days incl. weekends.)
- **Draft-schedule calendar** (month grid + week-view toggle): each day shows RN/LPN/CCA across Day/Evening/Night as color-coded, draggable chips. **Drag a name onto a coworker → swap**; **drag onto an Open slot → fill it** (their old slot reopens). Same-role only; 8h-rest enforced; cross-role/rest-breaking drops rejected with a friendly message. Backed by `POST /api/schedules/move {sourceShiftId,targetShiftId}`. (Replaced the old flat table for managers.)
- Review-before-post: **Distribution preview** (per-person load + fairness spread) → drag-and-drop balance → **Post** (publish). The reassign-candidates endpoint still exists as a fallback.
- Open-shift board (ranked candidates, assign, release); **Live attendance**; **Timecards** (approve/reopen + missed-punch fix); **Time-off approvals**.
- **My Staff** (admin): roster with metrics (shifts worked, attendance %, punctuality %, pay, reliability, call-ins); per-person HR docs (upload multi-PDF, download single, download-all merged, delete); read-only staff certifications (+ soon staff-uploaded cert docs).
- Multi-site **site switcher** (web toolbar + all admin views; mobile Home + every admin view); overtime cost dashboard + payroll CSV (admin-only); audit log. Manager keeps per-shift **Sick** action.

## Business Rules
- Skill match (shift requires a certification); **8-hour rest between work blocks; doubles (two back-to-back shifts = 16h) allowed, triples (24h) blocked; NO weekly-hours cap** (centralized in `backend/src/utils/rest.ts` → `checkRest`, used by the generator, calendar drag-drop, reassign, and staff pickup). Overtime *pay* (1.5× over 40h/wk) is still tracked for cost projections only.
- Scheduler fills manager-defined per-shift counts (default 1 each); unfilled → OPEN; fair distribution (fewest accumulated hours, tie-break = worked-longest-ago).
- **Draft schedules are admin-only**: STAFF see neither assigned nor OPEN shifts until the period is **PUBLISHED**. Generating replaces the whole period (must re-post).
- **Pay/hourly rate = ADMIN-only**, enforced server-side.
- **Multi-tenant isolation**: all facility-scoped queries go through `utils/tenant.ts`; an ADMIN sees only their Organization; cross-tenant access → 403.
- **Certifications**: staff manage their own, admins view read-only. **Cert documents**: visible only to the owner + their managers/admins, never to other staff; staff cannot see admin-uploaded HR docs (`StaffDocument.source = STAFF` vs `ADMIN`).
- Account deletion anonymizes PII but keeps de-identified work records. Billing is B2B / out-of-app (no in-app purchases).
- **Auto sign-out after 7 minutes of inactivity** (web + mobile; `IDLE_MS` in each app root). Any interaction resets it. Web persists `ns_last_activity` so a tab reopened after the window lands on login; mobile re-checks on returning to the foreground. (Separate from the still-pending `expo-secure-store` token-at-rest work.)

## Data Model (Prisma; `prisma db push`, no migrations dir)
Organization, Facility, Unit, UnitStaffAssignment, User (role, `certification` enum RN/LPN/CCA, hourlyRate, facilityId, organizationId), SchedulePeriod, Shift (status DRAFT/PUBLISHED/OPEN/CANCELLED, requiredCertification, openReason), SwapRequest, ClockInEvent, CallInReport, Notification, RefreshToken, AvailabilityBlock, TimeOffRequest, AuditLog, StaffingRequirement (facility×shift×cert→count), TimecardApproval (user+day), StaffDocument (PDF bytes in DB; **source: ADMIN|STAFF**), StaffCertification (name, number?, expiryDate?). Password-reset tokens live in Redis (hashed, 1h TTL).

## Key Decisions
- Docker runs **inside WSL** (Docker Desktop is broken — do not use).
- Backend connects to the DB via the **WSL IP** (currently `172.21.80.209`) in `backend/.env`, NOT `localhost` (WSL localhost forwarding is broken here).
- Mobile pinned to **Expo SDK 54**; standalone builds via **EAS**; API base = `EXPO_PUBLIC_API_URL` (per-profile in `eas.json`), dev fallback = LAN IP.
- Permanent **bundle id placeholder** `com.yourcompany.nursescheduler` — set before first store build.
- File storage = **bytes in Postgres** (no S3). Scheduling UI lives in **My Space** (off managers' Home; staff Home shows "My shifts").
- Launch: commercial multi-tenant; registered-company publisher; **Render** managed hosting (recommended); **Resend** email (not yet configured).

## Known Issues
- **WSL↔Windows networking**: `localhost` forwarding dead → backend uses WSL IP. After a cold boot the link "warms up" over a few minutes (first DB calls 500, then stabilize). Do NOT `wsl --shutdown` to fix it (resets the warm-up). WSL IP can change on reboot → update `backend/.env` (`wsl hostname -I`).
- `prisma generate` fails with **EPERM** while the backend tsx-watch runs → stop backend first.
- `backend/src/controllers/clock.controller.ts` is **dead/stale** (refs nonexistent `prisma.clockIn`); live clock logic is in `clock.routes.ts`.
- No automated tests beyond `isolation.test.ts`; verification is manual (web preview / Metro bundle compile / curl).
- Mobile is **current-month only** (no month switcher).
- Email (Resend) and SMS/push (Twilio/Expo) are stubbed / dev-mode. Dev servers don't survive reboot.

## Open Questions
- Cert documents are a general per-staff bucket (not attached per cert record) — confirm if per-cert attachment is wanted.
- Should admins be able to add/edit certifications on a staff member's behalf? (currently staff-only)
- Add expiry alerts/dashboard when a certification is nearing expiry? (not built)
- Add a mobile month switcher?

## Next Steps
1. **Cert documents — COMPLETE** (backend + web + mobile, all verified). Also landed this session: the web **drag-and-drop schedule calendar** (month/week toggle, swap/fill, open-slot gaps) and the **rest-rule change** (no 40h weekly cap; doubles allowed; triples blocked; `utils/rest.ts`). Possible follow-up: bring the calendar + drag-drop to the **mobile** app (it still uses the older schedule list).
2. **Launch prep** (see `LAUNCH-CHECKLIST.md` + `DEPLOY-RENDER.md`). Backend is now **Render-ready**: `render.yaml` blueprint (API + managed Postgres + Redis), prod runs via **tsx** (no tsc build — dead controller files break `tsc`; `tsx` ignores them), `db:push` syncs schema on deploy, `tsx`+`prisma` moved to deps, refreshed `.env.example`, root `.gitignore`. Email is already Resend-ready (just set `RESEND_API_KEY`+`EMAIL_FROM`). **REMAINING — user:** push repo to GitHub → Render Blueprint deploy → set secrets (`ALLOWED_ORIGINS`,`APP_WEB_URL`,Resend); D-U-N-S + Apple/Google org accounts; pick real **bundle id** (still `com.yourcompany.nursescheduler`); fill + lawyer the legal pages. **DONE this session (code):** `setup:admin` first-org/admin bootstrap (`backend/src/scripts/createFirstAdmin.ts` — env-driven, idempotent; run once on the live empty DB); **Sentry** error tracking (`backend/src/instrument.ts` + capture in `error.middleware.ts`, no-op until `SENTRY_DSN` set). **REMAINING — code:** `expo-secure-store` token persistence (mobile keeps token only in memory — logs out on restart); point `eas.json`/web at the live API URL once deployed; EAS AAB/IPA builds.
3. **Optional**: mobile month switcher; admin certification management; cert-expiry alerts; Phase C HR (seniority, wage grid, doc mgmt); Phase D comms/reporting.

## Tech / Integration Notes
- **Fire-up after reboot**: (1) start WSL: `wsl -d Ubuntu -e bash -lc "docker ps"` (ns-postgres/ns-redis auto-start); (2) confirm `backend/.env` DB/Redis host = current WSL IP; (3) `cd backend && npm run dev`, `cd web && npm run dev`, `cd mobile-app && npx expo start --lan`; (4) wait a few minutes + retry login while the DB link warms.
- **Demo logins** (password `Password123!`): `admin@demo.com` (Tenant A, 3 sites), `manager@sunrise.demo`, `nurse@demo.com` (RN; seeded certs + a cert doc), `admin@northstar.demo` (Tenant B). Web `http://localhost:5173` · Mobile `exp://192.168.1.109:8081` (Expo Go, same Wi-Fi).
- **Scripts**: `npm run db:seed` (wipes + reseeds 2 orgs/sites/staff); `npx tsx src/scripts/seed-clockins.ts` (clock history so metrics populate — re-run after reseed); `npx tsx src/scripts/isolation.test.ts` (tenant isolation, 8/8).
- Backend deps: multer, pdf-lib. Mobile deps: expo-document-picker, expo-file-system, expo-sharing (all in Expo Go runtime — no custom build needed).
- Legal pages served by backend: `/privacy`, `/terms`, `/delete-account` (templates — fill `[BRACKETS]`).
- `mobile-app/AGENTS.md`: verify versioned Expo docs before writing Expo code (installed SDK = 54).
- Permissions auto-allow in `Desktop/.claude/settings.json`.

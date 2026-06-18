# NurseScheduler — Project State

_Auto-saved handoff summary. Updated as work progresses / before context limits._

## 1. Goal
A nursing-home workforce-management app (web + mobile) for shift scheduling, self-service, and compliance — a healthcare-specialized, premium alternative to Homebase.

## 2. Current status
**Completed & working:**
- **Infra:** PostgreSQL + Redis in Docker *inside WSL Ubuntu* (Docker Desktop abandoned). Backend (Express/Prisma) `:4000`, web (Vite/React) `:5173`, mobile (Expo SDK 54) via `exp://192.168.1.109:8081`.
- **Scheduling:** skill-aware auto-scheduler (RN/LPN/CCA) enforcing 8h-rest, 40h/week cap, fair distribution, **approved leave**, and **availability**; unfilled slots → OPEN shifts.
- **Open-shift board:** overtime-aware ranked candidates, one-tap accept, manager assign.
- **Self-service:** call-in-sick, drop-to-board, peer shift trade (both timings), time-off requests + approvals, weekly availability grid, in-app notifications (bell + 30s poll), **time clock (clock in/out) + personal timecard**.
- **Navigation:** bottom toolbar (Home / My Space); "My Space" is a hub page → Request time off, My availability, My timecard (staff) / Time-off approvals (manager).
- **Mgmt:** multi-site (admin), **live attendance** ("who's clocked in now"), **facility timecards w/ per-day approval + missed-punch correction**, overtime cost dashboard, payroll CSV export, audit log. Pay rates **admin-only**.
- **UX:** premium design system (Inter, navy/teal, soft badges), light/dark toggle, "More" menu hosting time-off + availability sub-pages. Mobile has calendar date-picker + bell icon.

## 3. In-progress work
**Phase B — Time & Attendance.** Done: clock-in/out toggle + personal timecard (web + mobile); **manager attendance view** ("who's clocked in now", live 20s poll), **facility timecards** with **per-day approval** (approve / reopen), **missed-punch detection + correction** (manager adds the forgotten punch). All audit-logged + staff-notified. Next: time-bank & accruals; mirror the manager views into the mobile app (web-only so far).

## 3b. Production launch prep (App Store + Play) — started 2026-06-16
Goal locked with user: **commercial multi-facility product**, **registered company** publisher, **managed hosting**. Full tracked plan in [`LAUNCH-CHECKLIST.md`](LAUNCH-CHECKLIST.md). Done so far:
- **Multi-tenancy:** new `Organization` model above `Facility`; `organizationId` on Facility + User + JWT. All facility-scoped routes go through `utils/tenant.ts` (`resolveScopedFacility` / `assertFacilityInScope`). ADMIN now sees only their org's sites. Automated isolation test `backend/src/scripts/isolation.test.ts` (`npx tsx ...`) — **8/8 pass**. Seed now creates 2 tenants (Org A = admin@demo.com over 3 sites; Org B = admin@northstar.demo).
- **Mobile build readiness:** removed hardcoded LAN IP → `EXPO_PUBLIC_API_URL` (`mobile-app/.env.example`); added `eas.json` (dev/preview/prod profiles) + store fields in `app.json` (bundle id **placeholder** `com.yourcompany.nursescheduler`, iPhone-only, build numbers).
- **Account deletion (Apple 5.1.1(v) / Play):** `POST /api/account/delete` scrubs PII + disables login (work records retained de-identified). In-app "Delete account" on **web** (My Space) and **mobile** (My Space).
- **Legal pages:** `/privacy`, `/terms`, `/delete-account` served from `backend/public/` (TEMPLATES — `[BRACKETS]` to fill + counsel review).
- **Forgot/reset password:** `POST /api/auth/forgot-password` + `/reset-password` (single-use tokens in **Redis**, 1h TTL, hashed; generic response = no email enumeration; resets invalidate refresh tokens). Web: "Forgot password?" on login + a reset screen on `/?reset=<token>`. Mobile: "Forgot password?" on login (reset completed via the web link in the email). Email via `services/email.service.ts` — **Resend** if `RESEND_API_KEY` set, else **dev mode** (logs link; `forgot-password` returns `devResetUrl` in non-prod). Verified end-to-end (8 checks). Remaining: configure Resend + set `APP_WEB_URL` for prod.

**Biggest remaining blockers:** (1) accounts + D-U-N-S [user]; (2) deploy backend to HTTPS host (Render); (3) forgot-password + secure token storage + Sentry; (4) legal content review.

## 4. Open tasks / TODOs (prioritized)
- **Phase B (cont.):** time-bank & accruals (vacation/sick balances); port manager attendance + timecard-approval views to the mobile app (currently web-only)
- **Phase C — HR:** seniority/hire dates, qualification expiry, wage grid, document management
- **Phase D — Comms/Reporting:** mass messaging, **real push/SMS** (needs Expo/Twilio accounts), emergency alerts, report suite + email delivery
- **Reliability (#10):** offline mode / SMS fallback
- Payroll *integration* — **deferred by user**

## 5. Known issues / bugs
- WSL→Windows localhost forwarding (5432/6379) **flaps ~30s after reboot**; fix = restart `ns-postgres`/`ns-redis` until both reachable, then start backend.
- Dev servers + `loca.lt` tunnel **do not survive reboot** (containers auto-restart; servers don't).
- Mobile pinned to **Expo SDK 54** (user's Expo Go); SDK 55/56 = "incompatible."
- No automated tests; verification is manual/driven.

## 6. Decisions made (do not change)
- Docker runs **inside WSL**, not Docker Desktop.
- Mobile stays **Expo SDK 54**; API base hardcoded to PC LAN IP in `mobile-app/App.js`.
- New `web/` + `mobile-app/` are the real apps; original `frontend/`, `mobile/` are dead scaffolds — ignore.
- Hourly rate / pay = **admin-only**, enforced server-side.
- Leave/availability compared by **calendar day in UTC** (avoids tz off-by-one).
- Permissions set to **bypass/auto-allow** in `Desktop/.claude/settings.json`.
- **Multi-tenant:** every facility-scoped query goes through `utils/tenant.ts` — never trust a client `facilityId`. `Organization` is the tenant boundary; an ADMIN is scoped to one org.
- **Demo logins are now two tenants:** admin@demo.com (Org A, 3 sites) + admin@northstar.demo (Org B). nurse@demo.com / manager@sunrise.demo unchanged (Org A). Password still `Password123!`.
- Mobile bundle id is a **placeholder** (`com.yourcompany.nursescheduler`) — must be set to the real reverse-DNS before the first store build (permanent).
- Account deletion **anonymizes** (keeps de-identified work records) rather than hard-deleting, to preserve payroll/audit integrity.

## 7. Project structure
- `backend/src/services/autoScheduler.service.ts` — core scheduling (skill/rest/cap/leave/availability)
- `backend/src/routes/` — `shift` (open board/accept/assign/release), `swap` (trades), `timeoff`, `availability`, `notification`, `facility`, `user`, `schedule`, `clock` (personal clock in/out + timecard **and** manager attendance/facility-timecards/approve/unapprove/correct)
- `backend/src/services/` — `audit.service.ts`, `notify.service.ts`
- `backend/prisma/schema.prisma` — models incl. Shift, SwapRequest, TimeOffRequest, AvailabilityBlock, ClockInEvent, **TimecardApproval** (one row per user+day), Notification, AuditLog
- `web/src/App.jsx` + `styles.css` — entire web UI
- `mobile-app/App.js` — entire mobile UI (Expo)
- `nursing-scheduler/START-HERE.md` — restart instructions

## 3c. Staffing-needs input (manager-defined shift counts) — 2026-06-16
Manager can now set **how many of each role per shift** instead of the old hardcoded "1 of each". New model `StaffingRequirement` (facilityId, shift, certification, count; `@@unique([facilityId,shift,certification])`; missing cells default to 1 = original behavior). Endpoints: `GET/PUT /api/schedules/requirements` (manager/admin, tenant-scoped via `resolveScopedFacility`, count clamped 0–20). `autoScheduler.service.ts` loads the counts and fills `count` slots per shift/cert (surplus → OPEN board). Web: a **"Staffing needs" 3×3 grid** (Day/Evening/Night × RN/LPN/CCA) on the manager Home, above the Generate button — set counts, Save, Generate fills them. Verified: defaults→270 shifts, (Day/RN=2,Day/CCA=0,Night/LPN=3)→330; per-site load + save + tenant 403 all pass. Mobile not yet updated (web-only, like the other manager tools).

## 3d. Review-before-post: distribution preview + admin swap + Post — 2026-06-16
New manager flow: **Generate (draft) → review distribution → swap to balance → Post**.
- **Equal distribution:** auto-scheduler assigns each slot to the fewest-accumulated-hours eligible staffer, tie-broken by who worked longest ago. Residual spread (rest-rule driven, e.g. 15–22 shifts) is surfaced for manual balancing.
- **Distribution preview** (`GET /api/schedules/workload`): per-staff shift count, hours, last shift + fairness spread (min–max). Web card "Distribution preview" with load pills (hi/lo highlight).
- **Swap/reassign** (`POST /api/schedules/reassign {shiftId,toStaffId}`): move a draft/posted shift to an eligible coworker (cert + 8h-rest + tenant enforced). Web: per-shift **Reassign** in the schedule table → pick from candidate list (`/api/shifts/:id/candidates`).
- **Draft gating + Post:** STAFF now see **PUBLISHED only** (`getScheduleForMonth`); managers see DRAFT+PUBLISHED. Web has a **Draft/Posted badge** + **Post schedule** button (PATCH publish, notifies staff). Generate on a posted schedule warns first.
- **Bug fixed:** regenerate now clears the **entire** period (was DRAFT/OPEN only) so re-generating after posting no longer leaves duplicate PUBLISHED shifts.
Verified end-to-end in the browser (generate→preview→reassign→post; staff see only after post). Mobile not updated (web-only).
- **Draft fully hidden from staff (2):** also gated the **open-shift board** — `/api/shifts/open` returns nothing to STAFF unless the period is PUBLISHED (was leaking a draft's unfilled OPEN slots). Verified: draft → staff schedule=0 AND open=0; posted → both visible.
- **Relocated to My Space:** the whole manager scheduling UI (staffing-needs grid + distribution preview + schedule with generate/post/reassign) moved off Home into **My Space → "Staffing needs and schedule"** (managers/admins). Home for managers no longer shows it; **staff still see their own published schedule on Home**. Toolbar + scheduleCard extracted to consts in `web/src/App.jsx` and reused. Verified in browser.
- **Date-range picker:** the staffing-needs block now has a **From/To calendar** (`schedRange` state, defaults to the whole month, constrained to it). Generate passes `startDate`/`endDate`; `generateMonthlySchedule(facilityId, month, year, {startDate, endDate})` clamps to the month and only creates shifts for days in range (skips others by `dayStr` compare). Verified: 5-day range → 45 shifts; full month → 270. NOTE: generate still wipes the whole period, so a partial range produces a schedule covering only those dates.

## 3e. "My Staff" HR view (admin) — 2026-06-17
New admin-only My Space folder **"My Staff"** (per site): roster of each staffer with HR metrics + document management.
- **Model:** `StaffDocument` (PDF bytes stored in DB — no external file store). Deps added: **multer** (multipart upload) + **pdf-lib** (merge).
- **Endpoints** (`backend/src/routes/staff.routes.ts`, ADMIN-only, tenant-scoped): `GET /api/staff/roster` (per-person shiftsWorked, attendance%, punctuality%, lateCount, callIns, pay+hours, reliability score/label, documentCount); `POST /:userId/documents` (multi-PDF), `GET /:userId/documents` (list), `GET /:userId/documents/:docId/download`, `GET /:userId/documents/merged` (pdf-lib merge), `DELETE /:userId/documents/:docId`.
- **Metrics:** attendance = worked/scheduled past shifts; punctuality = clock-in ≤ start+5min of worked; reliability = 0.6·attendance + 0.4·punctuality − callIns·5 → Excellent/Good/Fair/At risk; pay = month's scheduled hours × rate.
- **Web:** admin My Space link "My Staff" → roster table (reliability pills) → expand a person for a detail grid + documents (upload multiple PDFs, list, per-file Download, **Download all (merged)**, Delete).
- **Demo data:** `backend/src/scripts/seed-clockins.ts` seeds realistic clock-in history for past shifts so metrics vary (Excellent/Fair/At risk). Re-run after re-seeding/regenerating.
- Verified end-to-end in browser (roster, expand, upload via API, merged download = 3 pages, delete refresh 2→1→0). Documents are PDF-only, ≤15MB, ≤10 per upload.

## 3f. Certification tracking (staff self-service + admin view) — 2026-06-17
New **Certification** section under My Space (staff) on **web + mobile**, plus admin visibility in My Staff.
- **Model:** `StaffCertification` (userId, name, number?, expiryDate?) — distinct from the `Certification` enum (RN/LPN/CCA). Relation `User.staffCertifications`.
- **Endpoints** (`backend/src/routes/certification.routes.ts`): `GET /api/certifications` (own) / `?userId=` (managers/admins, org-scoped); `POST` / `PATCH /:id` / `DELETE /:id` (own only).
- **Staff:** My Space → Certification → add (name, number, expiry date) + list with expiry status pill (Valid / Expires in Nd / Expired / No expiry) + remove. Web + mobile.
- **Admin:** My Staff detail shows a read-only "Certifications (N)" subsection with each cert + expiry status. Web + mobile.
- Expiry status computed client-side (<0 = Expired red, ≤30d = warning, else Valid green). Verified end-to-end (web browser: staff add → admin sees "Certifications (2)", CPR "Expires in 13d", RN "Valid"; mobile bundle compiles). Seeded demo: nurse@demo has RN License (valid) + CPR/BLS (expiring) certs.

## 8. Next step (resume here — paused 2026-06-17 EOD)

### ⭐ TOP REQUEST (user, 2026-06-17): port ALL admin features to the MOBILE app
**Progress (2026-06-17):** Mobile admin foundation DONE — `isAdmin` + **site switcher** (chips on home, `siteQ` on all loads), admin My Space links. **My Staff** (roster + tap-to-expand metrics; PDF deferred). **Live attendance**. **Staffing & schedule** view DONE — 3×3 needs grid (TextInputs) + Save, From/To date pickers (reuses `DateTimePicker`), Generate, Distribution preview + Draft/Posted badge + **Post**, schedule list with per-shift **Reassign** (candidates) + manager **Sick**/Drop. Manager home no longer shows the schedule (moved to this view; staff home shows "My shifts"). **Timecards** view DONE (per-day approve/reopen + missed-punch **Fix** via a time picker → POST /correct). **My Staff PDF** DONE — `expo-document-picker` + `expo-file-system/legacy` + `expo-sharing` installed (in Expo Go runtime, no rebuild); per-person Upload PDFs (multi), Open (single), Delete, **Download all** (merged → share sheet). Bundle compiles (5.66 MB). **Mobile admin parity is now COMPLETE** — all web admin features are on mobile. Verify on device (reload Expo Go). Site switcher now appears in **every admin view** (Home + My Staff + Live attendance + Staffing & schedule + Timecards) via a reusable `siteSwitcher` element — admin can jump sites without leaving the screen. Remaining mobile polish (optional): adjustable month (mobile is current-month only).

Original ask (for reference):
The mobile app (`mobile-app/App.js`, Expo SDK 54) is currently **staff-focused + a thin manager view**. The user wants the **admin** to have, on mobile, everything the web admin has. Web-only admin features to port:
- **My Space → Staffing needs and schedule:** staffing-needs grid (3×3 + From/To date calendar), Generate, **Distribution preview**, **Reassign/swap**, **Post** (publish), Draft/Posted state.
- **My Space → My Staff:** roster with metrics (shifts worked, attendance%, punctuality%, pay, reliability), per-person detail, **PDF upload (multiple)**, **Download all (merged)**, delete. (File upload on RN/Expo needs `expo-document-picker` + `expo-file-system`; download/share needs `expo-sharing` — these deps are NOT yet installed.)
- **My Space → Live attendance**, **Timecards** (approve + missed-punch fix), **Time-off approvals** (these exist partially on mobile — verify/extend).
- Site switcher for admins on mobile (the web toolbar's site/month picker).
All the **backend endpoints already exist and are mobile-ready** — this is mobile UI work. Keep mobile on **Expo SDK 54** (Expo Go). API base already env-driven (`EXPO_PUBLIC_API_URL`, falls back to LAN IP).

### Also open (production-launch prep — see LAUNCH-CHECKLIST.md)
1. **Deploy backend to HTTPS host (Render)** — biggest launch blocker.
2. **Secure token storage** on mobile (`expo-secure-store`); **Sentry**; configure **Resend** email + `APP_WEB_URL`.

**State at shutdown:** all code saved to disk (project is NOT a git repo). DB (Postgres in WSL Docker) persists. Dev servers (backend :4000, web :5173, Expo :8081) were killed by laptop shutdown — restart per START-HERE.md. After restart, if metrics look empty, re-run `cd backend && npx tsx src/scripts/seed-clockins.ts`. LAN IP 192.168.1.109.

**Resume logins** (password `Password123!`): admin@demo.com (Tenant A, 3 sites), manager@sunrise.demo, nurse@demo.com, admin@northstar.demo (Tenant B). Web = http://localhost:5173 · Mobile = `exp://192.168.1.109:8081` in Expo Go.

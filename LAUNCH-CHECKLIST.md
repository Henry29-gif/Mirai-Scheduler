# NurseScheduler — App Store Launch Checklist

Production launch on **Google Play + Apple App Store**. Decisions locked: **commercial
product (multi-facility)**, **registered company** as publisher, **managed cloud hosting**.

Legend: `[x]` done · `[ ]` to do · ⚠ = approval risk · 👤 = only you can do it (accounts/legal/$)

---

## Phase 0 — Accounts & legal (start NOW, these have wait times)
- [ ] 👤 Register the company legal entity (LLC/Inc) if not already
- [ ] 👤 Request a **D-U-N-S number** for the company (free, ~1–2 weeks) — needed for Apple Organization + Google org verification
- [ ] 👤 Enroll in **Apple Developer Program — Organization** ($99/yr)
- [ ] 👤 Create **Google Play Console — Organization** account ($25 one-time) + complete business verification
- [ ] 👤 Buy a **domain** (~$12/yr) for API + website + policy pages
- [ ] 👤 Decide the permanent **bundle ID** (currently placeholder `com.yourcompany.nursescheduler` in `mobile-app/app.json` + `eas.json`) — ⚠ this can never change after first publish
- [ ] 👤 Pick a **public app name** (≤30 chars) and confirm it's free on both stores

## Phase 1 — Production backend & security
- [x] Tenant isolation: `Organization` model; all data scoped per org; cross-tenant access returns 403 *(verified — `backend/src/scripts/isolation.test.ts`, 8/8)*
- [x] No hardcoded API URL in the app — env-driven (`EXPO_PUBLIC_API_URL`)
- [x] Account-deletion endpoint + scrubbing of PII (`POST /api/account/delete`)
- [x] Public legal pages served (`/privacy`, `/terms`, `/delete-account`)
- [ ] 👤 Deploy backend to **managed host** (recommend **Render**: web service + managed Postgres + managed Redis, auto-HTTPS, daily backups). ~$25–50/mo
- [ ] Set production env vars on the host: strong `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `ALLOWED_ORIGINS` (lock CORS to your domains)
- [ ] Point the API at a real domain over **HTTPS** (e.g. `https://api.yourdomain.com`); update `eas.json` production `EXPO_PUBLIC_API_URL`
- [x] **Forgot-password / password reset** flow (web + mobile + backend; single-use tokens in Redis, 1h expiry, no email enumeration) — *verified*
  - [ ] 👤 Configure the **email provider** to actually send (sign up at resend.com, verify a domain, set `RESEND_API_KEY` + `EMAIL_FROM`). Until then it runs in **dev mode** (reset links logged to the server console / returned as `devResetUrl`)
  - [ ] Set `APP_WEB_URL` to the production web URL so reset links point at the live site
- [ ] Use **expo-secure-store** for the JWT on device (Keychain/Keystore) instead of plain storage
- [ ] Add **Sentry** (or similar) crash/error reporting — mobile + backend
- [ ] Remove dev-only artifacts before prod: dead `backend/src/controllers/clock.controller.ts`, demo seed exposure
- [ ] `npm audit` clean on backend + mobile

## Phase 2 — Store compliance (privacy / permissions / data)
- [x] Account deletion in-app (web + mobile) — Apple Guideline 5.1.1(v)
- [x] Privacy Policy / Terms / Delete-Account page templates *(in `backend/public/` — ⚠ fill `[BRACKETS]` + have counsel review)*
- [ ] 👤 Replace every `[BRACKETED]` placeholder in the 3 legal pages; legal review
- [ ] Host the legal pages at public HTTPS URLs and use them in both store listings
- [ ] Apple **Privacy Nutrition Labels**: declare Contact Info (name/email/phone), Identifiers, **Financial Info (pay rate — sensitive)**, Usage, Diagnostics · Linked to identity · **Tracking: No**
- [ ] Google **Data Safety** form: same disclosures · "encrypted in transit: yes" · data-deletion method = `/delete-account`
- [ ] ⚠ Keep login **email/password only** (avoids Apple's forced "Sign in with Apple"). If you add Google/social login, you MUST add Sign in with Apple
- [ ] ⚠ **No patient health data, ever** — keeps you out of HIPAA scope
- [ ] ⚠ Remove the unused location capture from clock-in (don't request location permission for v1)

## Phase 3 — Builds (AAB + IPA via EAS)
- [x] `eas.json` build profiles (development / preview / production) with per-env API URL
- [x] `app.json`: `ios.bundleIdentifier`, `android.package`, build numbers, iPhone-only (`supportsTablet:false`)
- [ ] Install EAS CLI + `eas login`; run `eas build:configure`
- [ ] `eas build --platform android --profile production` → signed **.aab** (target API 34+; Play App Signing)
- [ ] `eas build --platform ios --profile production` → signed **.ipa** (EAS-managed credentials)

## Phase 4 — Store assets
- [ ] App icon **1024×1024** PNG (no transparency/rounded corners) — `mobile-app/assets/icon.png`
- [ ] Android adaptive icon + **512×512** Play icon + **feature graphic 1024×500** (required)
- [ ] iOS screenshots: **6.7″ (1290×2796)** + 6.5″ (1242×2688), real app screens
- [ ] Android screenshots: **≥2** phone (e.g. 1080×1920)
- [ ] Listing copy: name (≤30), iOS subtitle (≤30), description (≤4000), iOS keywords (≤100, comma-sep)
- [ ] Category: **Business** (safer/faster than Medical) · age rating questionnaires (both)
- [ ] Support URL + Privacy Policy URL in both listings

## Phase 5 — Testing
- [ ] iOS **TestFlight** internal → external beta
- [ ] Android **Internal testing → Closed testing** (org account = no 20-tester gate ✅)
- [ ] Provide a **reviewer demo login** in App Review notes (safe demo tenant, not real customer data)
- [ ] Test matrix: login, token expiry+refresh, forgot-password, **cross-tenant isolation**, clock in/out, scheduling, time-off, offline/airplane mode, low-end Android + latest iPhone

## Phase 6 — Submit & avoid rejection (⚠ tailored)
- [ ] 5.1.1 — login wall: demo account + notes provided
- [x] 5.1.1(v) — in-app account deletion present
- [ ] Privacy labels / Data Safety match real behavior
- [ ] 3.1.1 IAP — ⚠ bill facilities **out-of-app** (invoice/contract); no "subscribe & pay" screens in the app
- [ ] 2.1 — no crashes on review (thorough beta first)
- [ ] 2.3 — screenshots are real app, no medical/clinical claims
- [ ] Android: target API level current, Data Safety accurate, reviewer can log in

---

### Done this session (foundation)
Multi-tenant isolation + automated test · env-based mobile API config + `eas.json` + store
identifiers · in-app account deletion (web + mobile) + backend endpoint · privacy/terms/
delete-account pages. See `PROJECT-STATE.md` for details.

### Biggest remaining blockers (in order)
1. 👤 Accounts + D-U-N-S (Phase 0) — start today, longest lead time
2. Deploy the backend to a host with HTTPS (Phase 1) — nothing ships until the app has a real API to talk to
3. Forgot-password + secure token storage + Sentry (Phase 1)
4. Legal page content + counsel review (Phase 2)

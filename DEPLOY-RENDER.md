# Deploying the backend to Render

This puts the API online with **HTTPS**, a **managed PostgreSQL** database, and
**managed Redis** — no servers to babysit. The repo already contains everything
Render needs (`render.yaml`). Plan on ~15–20 minutes.

> 💡 Render's free Postgres expires after ~90 days and free instances sleep when
> idle. For a real product use the paid **Starter** plans (a few $/month each).
> You can pick plans in the dashboard during setup.

---

## Step 1 — Put the code on GitHub
Render deploys from a Git repository, and this project isn't one yet.

1. Create a free account at **github.com** and make a **new private repo**
   (e.g. `nursing-scheduler`).
2. From the `nursing-scheduler` folder, push the code up. (Ask me and I'll run
   these for you.)
   ```bash
   git init && git add . && git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/nursing-scheduler.git
   git push -u origin main
   ```
   ⚠️ Make sure `backend/.env` is **NOT** committed (it holds local secrets).
   There should be a `.gitignore` ignoring `.env` and `node_modules` — I can add
   one before the first commit.

## Step 2 — Create the services on Render (one click)
1. Sign up at **render.com** and connect your GitHub.
2. **New ▸ Blueprint ▸** pick the `nursing-scheduler` repo ▸ **Apply**.
3. Render reads `render.yaml` and creates **three** things:
   - `nursescheduler-api` (the API)
   - `nursescheduler-db` (PostgreSQL)
   - `nursescheduler-redis` (Redis)

   `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET` are wired up automatically.

## Step 3 — Fill in the secret settings
Open **nursescheduler-api ▸ Environment** and set these (the ones marked
"sync: false" in the blueprint):

| Key | Value |
|---|---|
| `ALLOWED_ORIGINS` | your web app's address, e.g. `https://app.yourdomain.com` |
| `APP_WEB_URL` | same web address (used in password-reset emails) |
| `RESEND_API_KEY` | from Step 4 (optional — skip to keep email in "log only" mode) |
| `EMAIL_FROM` | e.g. `NurseScheduler <noreply@yourdomain.com>` |

The first deploy runs automatically. When it's green, your API is live at
`https://nursescheduler-api.onrender.com` — open `…/health` to confirm it
returns `{"status":"ok"}`.

## Step 4 — Email (Resend) — optional but recommended
Without this, password-reset emails are only written to the server log.
1. Sign up at **resend.com** (free tier is fine).
2. Verify your sending domain (or use their test domain to start).
3. Copy the API key into `RESEND_API_KEY` and set `EMAIL_FROM` (Step 3).

## Step 5 — Point the apps at the live API
- **Mobile:** in `mobile-app/eas.json`, set the `production` (and `preview`)
  `EXPO_PUBLIC_API_URL` to `https://nursescheduler-api.onrender.com`.
- **Web:** the web app talks to the API through a dev proxy today; for a real
  web deploy it needs to point at the same URL. (Separate task — the web app
  also needs hosting, e.g. Render Static Site, Netlify, or Vercel.)

---

## ⚠️ Before real customers: creating your first real account
The production database starts **empty** (no demo data). The app has login only —
there's no public "sign up a new facility" flow yet. So you'll need a one-time
way to create your **first organization + admin**. Easiest options:
- I can add a small **"create first admin/org" script** you run once against the
  production database, **or**
- a protected one-time setup endpoint.

Tell me which you prefer and I'll build it.

## Notes
- Schema changes deploy automatically (`prisma db push` runs on each deploy).
- Backend runs via `tsx` in production (fast, no build step) — matches how it
  runs in dev.
- A custom domain (e.g. `api.yourdomain.com`) can be added in Render ▸ Settings.

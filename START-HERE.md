# 🏥 NurseScheduler — How to start everything

Your app has 4 parts. Here's how to run them and where to look.
Open a terminal (PowerShell or Ubuntu) for each step.

> **Demo logins** (both apps): `admin@demo.com` or `nurse@demo.com`
> **Password:** `Password123!`

---

## 1. Database + Redis (run inside Ubuntu)
These run in Docker *inside Ubuntu* (we don't use Docker Desktop — it's broken by
the space in your Windows username). They auto-start, but if they're not running:

Open **Ubuntu** and run:
```bash
docker start ns-postgres ns-redis
docker ps        # should list both as "Up"
```

> **⚠ After a full PC restart — the database connection needs a few minutes to "warm up."**
> On this machine, Windows can't reach the database over `localhost`, so the backend is
> set to reach it by Ubuntu's network address instead (already configured in `backend/.env`).
> Two things to know:
> 1. If the backend says **"Can't reach database server"** right after a reboot, **just wait
>    and keep trying** — it becomes reliable after a few minutes. **Do NOT restart Ubuntu/WSL
>    to fix it; that makes it start over.**
> 2. If it *never* connects, Ubuntu's address may have changed. In **Ubuntu** run `hostname -I`,
>    take the **first** number (e.g. `172.21.80.209`), and make sure both `DATABASE_URL` and
>    `REDIS_URL` in `backend/.env` use that address. Then restart the backend.

## 2. Backend API (port 4000)
Open **PowerShell** (or any terminal) and run:
```powershell
cd "$HOME\Desktop\nursing-scheduler\backend"
npm run dev
```
Leave it running. Test: open http://localhost:4000/health → should say `{"status":"ok"}`.

## 3. Web app (port 5173)  ← open this in your browser
```powershell
cd "$HOME\Desktop\nursing-scheduler\web"
npm run dev
```
Then open **http://localhost:5173** in Chrome/Edge.

## 4. Mobile app (Expo)
**To see it in a browser:**
```powershell
cd "$HOME\Desktop\nursing-scheduler\mobile-app"
npx expo start --web
```
**To see it on your phone:**
1. Install the **"Expo Go"** app from the App Store / Google Play.
2. Make sure your phone is on the **same Wi-Fi** as this PC.
3. Run `npx expo start` (without `--web`), then scan the QR code with your
   phone (iPhone: Camera app · Android: inside Expo Go).
   - The app talks to this PC at `http://192.168.1.109:4000`. If your PC's
     Wi-Fi address ever changes, update the `API` line at the top of
     `mobile-app/App.js`.

---

## Notes
- **Order matters:** start #1 → #2 → then #3/#4.
- The database keeps its data between restarts (demo users + any schedules stay).
- To re-create demo users: `cd backend && npm run db:seed`.
- SMS (Twilio) and PDF export (AWS) are stubbed with placeholder keys — add real
  keys in `backend/.env` when you want those features.

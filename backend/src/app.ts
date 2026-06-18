import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes";
import shiftRoutes from "./routes/shift.routes";
import scheduleRoutes from "./routes/schedule.routes";
import swapRoutes from "./routes/swap.routes";
import clockRoutes from "./routes/clock.routes";
import callInRoutes from "./routes/callIn.routes";
import userRoutes from "./routes/user.routes";
import facilityRoutes from "./routes/facility.routes";
import timeoffRoutes from "./routes/timeoff.routes";
import availabilityRoutes from "./routes/availability.routes";
import unitRoutes from "./routes/unit.routes";
import notificationRoutes from "./routes/notification.routes";
import accountRoutes from "./routes/account.routes";
import staffRoutes from "./routes/staff.routes";
import certificationRoutes from "./routes/certification.routes";
import myDocumentsRoutes from "./routes/mydocuments.routes";

import { errorHandler } from "./middleware/error.middleware";

const app = express();

// ── Security ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────
app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: "Too many login attempts. Please try again later.",
}));

app.use("/api", rateLimit({
  windowMs: 1 * 60 * 1000, // 1 min
  max: 200,
}));

// ── Middleware ────────────────────────────────────────────────────────────
app.use(morgan("dev"));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// ── Health check ──────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// ── Public legal / compliance pages (store listings link to these URLs) ─────
const publicDir = path.join(process.cwd(), "public");
app.get(["/privacy", "/privacy.html"], (_req, res) => res.sendFile(path.join(publicDir, "privacy.html")));
app.get(["/terms", "/terms.html"], (_req, res) => res.sendFile(path.join(publicDir, "terms.html")));
app.get(["/delete-account", "/delete-account.html"], (_req, res) => res.sendFile(path.join(publicDir, "delete-account.html")));

// ── Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",          authRoutes);
app.use("/api/users",         userRoutes);
app.use("/api/facilities",    facilityRoutes);
app.use("/api/timeoff",       timeoffRoutes);
app.use("/api/availability",  availabilityRoutes);
app.use("/api/units",         unitRoutes);
app.use("/api/shifts",        shiftRoutes);
app.use("/api/schedules",     scheduleRoutes);
app.use("/api/swaps",         swapRoutes);
app.use("/api/clock",         clockRoutes);
app.use("/api/call-in",       callInRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/account",       accountRoutes);
app.use("/api/staff",         staffRoutes);
app.use("/api/certifications", certificationRoutes);
app.use("/api/my/documents",   myDocumentsRoutes);

// ── Error handler (must be last) ──────────────────────────────────────────
app.use(errorHandler);

export default app;

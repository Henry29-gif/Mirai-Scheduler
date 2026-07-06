import "dotenv/config";
import "./instrument"; // Sentry init — must run right after env loads, before the app
import http from "http";
import app from "./app";
import { initSocket } from "./socket/socket";
import { logger } from "./utils/logger";
import { scheduleRecurringJobs } from "./jobs/scheduler";

const PORT = process.env.PORT || 4000;

// Fail fast on unusable security config instead of 500-ing on every request.
if (process.env.NODE_ENV === "production") {
  const secret = process.env.JWT_SECRET || "";
  if (secret.length < 32 || secret.includes("change-me")) {
    logger.error("FATAL: JWT_SECRET is missing or too weak for production — refusing to start.");
    process.exit(1);
  }
}

const httpServer = http.createServer(app);
initSocket(httpServer);
scheduleRecurringJobs();

httpServer.listen(PORT, () => {
  logger.info(`🏥 Nursing Scheduler API running on port ${PORT}`);
});

export default httpServer;

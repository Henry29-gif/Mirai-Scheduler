import "dotenv/config";
import "./instrument"; // Sentry init — must run right after env loads, before the app
import http from "http";
import app from "./app";
import { initSocket } from "./socket/socket";
import { logger } from "./utils/logger";
import { scheduleRecurringJobs } from "./jobs/scheduler";

const PORT = process.env.PORT || 4000;

const httpServer = http.createServer(app);
initSocket(httpServer);
scheduleRecurringJobs();

httpServer.listen(PORT, () => {
  logger.info(`🏥 Nursing Scheduler API running on port ${PORT}`);
});

export default httpServer;

/**
 * BullMQ Workers — process background jobs
 * Run in a separate process (or same process in dev)
 */
import { Worker } from "bullmq";
import { redis } from "../config/redis";
import { sendCallInAlert } from "../services/notification.service";
import { generateMonthlySchedule } from "../services/autoScheduler.service";
import { logger } from "../utils/logger";

const connection = redis;

// ── Call-in SMS worker ────────────────────────────────────────────────────────
export const callInWorker = new Worker(
  "call-in-alerts",
  async (job) => {
    logger.info(`[Worker] Processing call-in alert job ${job.id}`);
    await sendCallInAlert(job.data.callInReportId);
  },
  { connection, concurrency: 5 }
);

// ── Schedule generation worker ───────────────────────────────────────────────
export const scheduleWorker = new Worker(
  "schedule-gen",
  async (job) => {
    const { facilityId, month, year } = job.data;
    logger.info(`[Worker] Generating schedule for facility=${facilityId} ${year}-${month}`);
    const result = await generateMonthlySchedule(facilityId, month, year);
    logger.info(`[Worker] Schedule generated: ${result.shiftsCreated} shifts`);
    return result;
  },
  { connection, concurrency: 2 }
);

callInWorker.on("failed", (job, err) => logger.error(`Call-in job ${job?.id} failed`, err));
scheduleWorker.on("failed", (job, err) => logger.error(`Schedule job ${job?.id} failed`, err));

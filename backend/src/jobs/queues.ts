import { Queue } from "bullmq";
import { redis } from "../config/redis";

const connection = redis;

export const callInQueue     = new Queue("call-in-alerts",   { connection });
export const scheduleQueue   = new Queue("schedule-gen",     { connection });
export const notificationQueue = new Queue("notifications",  { connection });

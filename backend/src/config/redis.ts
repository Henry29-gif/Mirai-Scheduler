import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Request-path client (auth middleware, socket handshake, password reset):
// fails FAST instead of queueing, so a Redis blip degrades gracefully (the
// callers catch and fall through) rather than hanging every API request.
export const redisAuth = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 2000,
  commandTimeout: 1000,
  lazyConnect: true,
});

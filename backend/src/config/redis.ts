import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// BullMQ's connection — it REQUIRES maxRetriesPerRequest: null, which (with
// ioredis's default offline queue) makes commands wait forever while Redis is
// unreachable. Fine for background jobs; never use this on a request path.
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

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

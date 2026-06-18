import { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { logger } from "../utils/logger";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  logger.error(err);
  const status  = err.statusCode || err.status || 500;
  if (status >= 500) Sentry.captureException(err); // report server errors (no-op if Sentry unconfigured)
  const message = err.message    || "Internal server error";
  res.status(status).json({ message, ...(process.env.NODE_ENV !== "production" && { stack: err.stack }) });
}

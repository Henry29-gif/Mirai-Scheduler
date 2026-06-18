import * as Sentry from "@sentry/node";

// Crash / error reporting. This is a NO-OP unless SENTRY_DSN is set, so local
// dev and un-configured deploys are completely unaffected. To turn it on, set
// SENTRY_DSN (from sentry.io) in the environment.
//
// Imported as the very first thing in index.ts (after dotenv) so Sentry can
// instrument the app before anything else loads.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
}

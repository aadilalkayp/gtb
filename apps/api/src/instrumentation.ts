import * as Sentry from "@sentry/nextjs";

/**
 * Next.js server-boot hook (runs once per server start, before any request).
 * Gives the container a real startup line: what booted, in which mode, at
 * which log level — the first thing to check in `docker logs`. Also boots
 * Sentry when SENTRY_DSN is set (a no-op otherwise, so dev/CI need nothing).
 */
export async function register(): Promise<void> {
  // Import inside register(): instrumentation is also evaluated for the edge
  // runtime during build, where node-only imports would fail.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      enabled: Boolean(process.env.SENTRY_DSN),
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      sendDefaultPii: false,
    });
    const { logger } = await import("./lib/logger.js");
    logger.info("gtb-os-api booted", {
      nodeEnv: process.env.NODE_ENV,
      logLevel: process.env.LOG_LEVEL ?? "(default)",
      node: process.version,
      sentry: Boolean(process.env.SENTRY_DSN),
    });
  }
}

/** Unhandled errors in route handlers / rendering reach Sentry through here. */
export const onRequestError = Sentry.captureRequestError;

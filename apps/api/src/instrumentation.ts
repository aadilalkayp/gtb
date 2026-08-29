/**
 * Next.js server-boot hook (runs once per server start, before any request).
 * Gives the container a real startup line: what booted, in which mode, at
 * which log level — the first thing to check in `docker logs`.
 */
export async function register(): Promise<void> {
  // Import inside register(): instrumentation is also evaluated for the edge
  // runtime during build, where node-only imports would fail.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("./lib/logger.js");
    logger.info("gtb-os-api booted", {
      nodeEnv: process.env.NODE_ENV,
      logLevel: process.env.LOG_LEVEL ?? "(default)",
      node: process.version,
    });
  }
}

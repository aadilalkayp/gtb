/**
 * Structured logger for the API. Zero dependencies on purpose: it must survive
 * the Next standalone/webpack build and keep working in the slim Docker image.
 *
 * - Production: one JSON object per line on stdout/stderr — `docker logs` stays
 *   grep-able (`docker logs api | grep '"level":"error"'`) and any future log
 *   shipper (Loki, CloudWatch, ...) can ingest it without a format change.
 * - Development: compact human-readable lines.
 * - `LOG_LEVEL` env var (debug|info|warn|error) controls verbosity; defaults to
 *   info in production, debug otherwise.
 * - `logger.child({...})` binds context (module name, request id, user id) so
 *   call sites never re-stringify it by hand.
 *
 * Request-scoped usage: route handlers wrapped by `withRequestLog` (route.ts
 * helper in ./handler.ts) get a logger bound to the request id via
 * `requestLog(req)`; `resolveAuthUser` enriches it with userId/role so the
 * access line identifies the caller.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isProd = process.env.NODE_ENV === "production";

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return isProd ? "info" : "debug";
}

const threshold = LEVEL_RANK[configuredLevel()];

export type LogContext = Record<string, unknown>;

/** Turn an Error (or anything thrown) into a plain serializable object. */
export function serializeError(err: unknown): LogContext {
  if (err instanceof Error) {
    return {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        ...(err.cause !== undefined ? { cause: String(err.cause) } : {}),
      },
    };
  }
  return { err: { message: String(err) } };
}

function emit(level: LogLevel, context: LogContext, msg: string, extra?: LogContext): void {
  if (LEVEL_RANK[level] < threshold) return;
  const time = new Date().toISOString();
  const fields = { ...context, ...extra };
  // warn/error → stderr, rest → stdout: standard stream discipline for
  // container logs and `docker logs --since ... 2>/dev/null` style filtering.
  const sink = LEVEL_RANK[level] >= LEVEL_RANK.warn ? console.error : console.log;

  if (isProd) {
    sink(JSON.stringify({ time, level, msg, ...fields }));
    return;
  }

  const ctx = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  sink(`${time.slice(11, 23)} ${level.toUpperCase().padEnd(5)} ${msg}${ctx ? `  ${ctx}` : ""}`);
}

export interface Logger {
  debug(msg: string, extra?: LogContext): void;
  info(msg: string, extra?: LogContext): void;
  warn(msg: string, extra?: LogContext): void;
  /** Pass the thrown value as `error` and it is serialized with its stack. */
  error(msg: string, extra?: LogContext & { error?: unknown }): void;
  /** New logger with additional bound context (module, reqId, userId, ...). */
  child(context: LogContext): Logger;
  /** The context currently bound to this logger (read-mostly; used by the request wrapper). */
  readonly context: LogContext;
}

function makeLogger(context: LogContext): Logger {
  return {
    context,
    debug: (msg, extra) => emit("debug", context, msg, extra),
    info: (msg, extra) => emit("info", context, msg, extra),
    warn: (msg, extra) => emit("warn", context, msg, extra),
    error: (msg, extra) => {
      const { error, ...rest } = extra ?? {};
      emit("error", context, msg, error !== undefined ? { ...rest, ...serializeError(error) } : rest);
    },
    child: (extraContext) => makeLogger({ ...context, ...extraContext }),
  };
}

/** Root logger. Prefer a module child: `const log = logger.child({ mod: "auth" })`. */
export const logger: Logger = makeLogger({});

// ---------------------------------------------------------------------------
// Request-scoped loggers
// ---------------------------------------------------------------------------

// Keyed by the Request object itself: no async-local storage needed, works in
// every runtime Next supports, and entries die with the request.
const requestLoggers = new WeakMap<Request, Logger>();

/** Bind a logger (carrying the request id) to a request. Called by withRequestLog. */
export function bindRequestLog(req: Request, log: Logger): void {
  requestLoggers.set(req, log);
}

/**
 * Logger for the current request — includes reqId (and userId/role once auth
 * has resolved). Falls back to the root logger for unwrapped callers.
 */
export function requestLog(req: Request): Logger {
  return requestLoggers.get(req) ?? logger;
}

/**
 * Enrich the request's bound logger — e.g. auth attaches { userId, role } so
 * the final access line and later log calls identify the caller.
 */
export function addRequestLogContext(req: Request, context: LogContext): void {
  const existing = requestLoggers.get(req);
  if (existing) requestLoggers.set(req, existing.child(context));
}

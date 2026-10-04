import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { corsHeaders } from "./cors.js";
import {
  createAuditContext,
  flushRequestAudit,
  isTrackedRole,
  runWithAuditContext,
  type AuditContext,
} from "@gtb/db";
import { touchPresence } from "@gtb/db/server";
import { bindRequestLog, logger, requestLog } from "./logger.js";
import { clientIp } from "./scan.js";

/**
 * Route-handler wrapper: the API's single source of request logging and
 * last-resort error handling.
 *
 * Every wrapped handler gets:
 * - a request id (honors an incoming `x-request-id` from a proxy, else a fresh
 *   UUID), echoed on the response so users/support can quote it;
 * - one access log line per request: method, path, status, duration, and —
 *   once resolveAuthUser has run — userId/role;
 * - a catch-all for unhandled errors: full stack to the log, an opaque 500
 *   with the request id (and CORS headers) to the client;
 * - a Team Pulse audit context (TEAM_PULSE_DESIGN.md §5.1): every database
 *   write made while handling the request is captured with the caller as
 *   actor, then persisted once the response is a success. A write request by
 *   tracked staff also counts toward their work day.
 *
 * Usage in a route file:
 *   export const POST = withRequestLog(async (req) => { ... });
 * Handlers log request-scoped details via `requestLog(req)` from ./logger.ts.
 */

type RouteHandler<R extends Request, Ctx> = (req: R, ctx: Ctx) => Response | Promise<Response>;

export function withRequestLog<R extends Request, Ctx = unknown>(
  handler: RouteHandler<R, Ctx>,
): RouteHandler<R, Ctx> {
  return async (req, ctx) => {
    const reqId = req.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
    const url = new URL(req.url);
    bindRequestLog(req, logger.child({ reqId }));
    const started = performance.now();

    const audit = createAuditContext({
      requestId: reqId,
      source: url.pathname.startsWith("/api/cron/") ? "cron" : "request",
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? undefined,
    });

    let res: Response;
    try {
      res = await runWithAuditContext(audit, () => handler(req, ctx));
    } catch (error) {
      discardAudit(req, audit);
      const durMs = Math.round(performance.now() - started);
      // Re-read the bound logger: auth may have enriched it with userId/role.
      requestLog(req).error("request failed", {
        method: req.method,
        path: url.pathname,
        status: 500,
        durMs,
        error,
      });
      // Our wrapper swallows the throw (opaque 500 to the client), so Next's
      // onRequestError never sees it — report explicitly. No-op without a DSN.
      Sentry.captureException(error, { tags: { reqId, path: url.pathname } });
      return Response.json(
        { error: "Internal server error", requestId: reqId },
        { status: 500, headers: { ...corsHeaders(req), "x-request-id": reqId } },
      );
    }

    await settleAudit(req, audit, res.status);

    const durMs = Math.round(performance.now() - started);
    const log = requestLog(req);
    const line = { method: req.method, path: url.pathname, status: res.status, durMs };
    if (res.status >= 500) log.error("request", line);
    else if (res.status >= 400) log.warn("request", line);
    else log.info("request", line);

    // Expose the request id to the caller without rebuilding the response.
    try {
      res.headers.set("x-request-id", reqId);
    } catch {
      // Immutable headers (e.g. a passed-through upstream response) — skip.
    }
    return res;
  };
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Persist the request's captured changes when it succeeded; a failed request's
 * transactions rolled back, so its buffer is dropped (and logged, so nothing
 * vanishes silently). Audit problems never fail the response itself.
 */
async function settleAudit(req: Request, audit: AuditContext, status: number): Promise<void> {
  if (status >= 400) {
    discardAudit(req, audit);
    return;
  }
  try {
    const changes = await flushRequestAudit(audit);
    const actor = audit.actor;
    if (actor && isTrackedRole(actor.role) && WRITE_METHODS.has(req.method)) {
      await touchPresence(actor.id, new Date(), { changes });
    }
  } catch (error) {
    requestLog(req).error("audit flush failed", { error, pending: audit.pending.length });
  }
}

function discardAudit(req: Request, audit: AuditContext): void {
  if (audit.pending.length === 0) return;
  requestLog(req).warn("audit entries discarded with failed request", {
    entries: audit.pending.map((p) => `${p.model}:${p.entityId}:${p.verb}`),
  });
  audit.pending.length = 0;
}

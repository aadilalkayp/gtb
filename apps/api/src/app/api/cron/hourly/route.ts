import type { NextRequest } from "next/server";
import { runChatEmailAlerts } from "@/lib/chatJobs";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Hourly jobs (gtb-cron-hourly.timer): the 12-hour unread chat email.
 * Same CRON_SECRET guard as /api/cron/daily.
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    requestLog(req).error("CRON_SECRET is not configured, job refused");
    return json(req, { error: "Scheduler not configured" }, 503);
  }
  if (req.headers.get("x-cron-secret") !== secret) return json(req, { error: "Forbidden" }, 403);
  const report = await runChatEmailAlerts();
  return json(req, { ok: true, at: new Date().toISOString(), report });
}

export const GET = withRequestLog(handleGet);

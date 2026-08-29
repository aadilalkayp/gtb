import type { NextRequest } from "next/server";
import { runDailyJobs } from "@gtb/db/server";
import { runScanJobs } from "@/lib/scanJobs";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * SYS-2: the daily automation job, invoked by an external scheduler (Vercel
 * Cron / GitHub Actions / Supabase scheduled function — deployment detail, see
 * REMEDIATION_PLAN.md SYS-2). Guarded by a shared CRON_SECRET in the
 * `x-cron-secret` header so it can never be fired by an anonymous caller.
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    requestLog(req).error("CRON_SECRET is not configured — job refused");
    return json(req, { error: "Scheduler not configured" }, 503);
  }
  if (req.headers.get("x-cron-secret") !== secret) {
    return json(req, { error: "Forbidden" }, 403);
  }

  const report = await runDailyJobs();
  const scanReport = await runScanJobs();
  return json(req, { ok: true, at: new Date().toISOString(), report: { ...report, ...scanReport } });
}

export const GET = withRequestLog(handleGet);

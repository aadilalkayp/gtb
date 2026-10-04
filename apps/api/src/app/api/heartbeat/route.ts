import type { NextRequest } from "next/server";
import { isTrackedRole } from "@gtb/db";
import { recordHeartbeat } from "@gtb/db/server";
import { isActivityModule } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { rateLimit } from "@/lib/scan";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Pings closer together than this are acknowledged but not processed. */
const MIN_INTERVAL_MS = 5_000;
const lastBeat = new Map<string, number>();

/**
 * Staff app heartbeat (Team Pulse, TEAM_PULSE_DESIGN.md §5.5). The staff web
 * app sends one at most once a minute, and only while the tab is visible and
 * there was real input in the last 3 minutes, so each accepted beat marks the
 * current minute as active. The server clock decides the minute; the body only
 * says which module the person is in.
 *
 * Always 204 for authenticated callers (founders and clients are simply not
 * recorded), so the response reveals nothing.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders(req) });
  const noContent = new Response(null, { status: 204, headers: corsHeaders(req) });
  if (!isTrackedRole(user.role)) return noContent;

  const now = Date.now();
  const prev = lastBeat.get(user.id);
  if ((prev !== undefined && now - prev < MIN_INTERVAL_MS) || !rateLimit(`heartbeat:${user.id}`, 120)) {
    return noContent;
  }
  lastBeat.set(user.id, now);

  let module: unknown;
  try {
    ({ module } = (await req.json()) as { module?: unknown });
  } catch {
    module = undefined;
  }
  await recordHeartbeat(user.id, isActivityModule(module) ? module : "other", new Date(now));
  return noContent;
}

export const POST = withRequestLog(handlePost);

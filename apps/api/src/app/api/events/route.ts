import type { NextRequest } from "next/server";
import { isTrackedRole, prisma } from "@gtb/db";
import { recordActivityEvent } from "@gtb/db/server";
import { isClientEventVerb } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { rateLimit } from "@/lib/scan";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * Activity the server cannot see on its own (Team Pulse, TEAM_PULSE_DESIGN.md
 * §4.3, §4.4): a client profile opened, a CSV report exported, a sign-out.
 * Only the allowlisted verbs are accepted; times come from the server.
 *
 * Body: { verb: "client.viewed", entityId }
 *     | { verb: "report.exported", report, rows }
 *     | { verb: "auth.signed_out" }
 *
 * Always 204 for authenticated callers, recorded or not.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders(req) });
  const noContent = new Response(null, { status: 204, headers: corsHeaders(req) });
  if (!isTrackedRole(user.role) || !rateLimit(`events:${user.id}`, 600)) return noContent;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders(req) });
  }
  const verb = body.verb;
  if (!isClientEventVerb(verb)) {
    return Response.json({ error: "Unknown event" }, { status: 400, headers: corsHeaders(req) });
  }
  const actor = { id: user.id, role: user.role };

  switch (verb) {
    case "client.viewed": {
      const clientId = typeof body.entityId === "string" ? body.entityId : "";
      const client = clientId
        ? await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
        : null;
      if (client) {
        await recordActivityEvent({
          actor,
          verb,
          kind: "view",
          entityType: "Client",
          entityId: client.id,
          clientId: client.id,
          module: "clients",
        });
      }
      break;
    }
    case "report.exported": {
      const report = typeof body.report === "string" ? body.report.slice(0, 120) : "";
      const rows = typeof body.rows === "number" && Number.isFinite(body.rows) ? Math.max(0, Math.floor(body.rows)) : null;
      if (report) {
        await recordActivityEvent({
          actor,
          verb,
          kind: "export",
          entityType: "Report",
          entityId: report,
          module: "reports",
          meta: { report, rows },
        });
      }
      break;
    }
    case "auth.signed_out":
      await recordActivityEvent({ actor, verb, kind: "auth", entityType: "User", entityId: user.id });
      break;
  }
  return noContent;
}

export const POST = withRequestLog(handlePost);

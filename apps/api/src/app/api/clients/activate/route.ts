import type { NextRequest } from "next/server";
import { activateClientPlan } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const ASSIGNERS = new Set(["founder", "ops_head"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Activate a converted client (SRS §6.1 steps 12–14, §7.3). Generates the
 * session schedule from the plan's service rules + wedding date, attaching the
 * assigned consultant per service, then flips the client to Active and sends a
 * welcome. STATE-2: all of it is one transaction with a skipDuplicates guard —
 * a double-activate produces exactly one schedule (see activateClientPlan).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!ASSIGNERS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let clientId: string | undefined;
  try {
    ({ clientId } = (await req.json()) as { clientId?: string });
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!clientId) return json(req, { error: "clientId is required" }, 400);

  let result;
  try {
    result = await activateClientPlan(clientId, authUser.id);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return json(req, { error: "Client not found" }, 404);
    if (msg === "NO_PLAN") return json(req, { error: "Client has no plan" }, 409);
    if (msg === "NOT_ACTIVATABLE") {
      return json(req, { error: "Only a converted client can be activated" }, 409);
    }
    if (msg === "NO_CONSULTANT") {
      return json(req, { error: "Assign at least one consultant before activating" }, 409);
    }
    throw e;
  }

  if (result.userId) {
    await notifyUsers([result.userId], {
      type: "client_activated",
      title: "Your program is live 🎉",
      body: "Your team is assigned and your sessions are scheduled. Check your calendar.",
      linkPath: "/portal/sessions",
    });
  }

  return json(req, { ok: true, sessionsCreated: result.sessionsCreated });
}

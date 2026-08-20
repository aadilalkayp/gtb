import type { NextRequest } from "next/server";
import { applySessionRating } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Client rates a completed session (SRS §13.1, SEC-4). The gateway does not
 * expose Session updates to clients — this is the only client write path, and
 * all validation lives in applySessionRating (server-side + DB CHECK).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (authUser.role !== "client") return json(req, { error: "Forbidden" }, 403);

  let body: { sessionId?: string; rating?: unknown; ratingFeedback?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.sessionId) return json(req, { error: "sessionId is required" }, 400);

  const result = await applySessionRating(authUser.id, {
    sessionId: body.sessionId,
    rating: Number(body.rating),
    ratingFeedback: typeof body.ratingFeedback === "string" ? body.ratingFeedback : undefined,
  });
  if (!result.ok) return json(req, { error: result.error }, result.status);

  return json(req, { ok: true, rating: result.rating });
}

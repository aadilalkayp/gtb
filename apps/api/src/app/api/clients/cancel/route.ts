import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { cancelClientPlan } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const CANCELERS = new Set(["founder", "ops_head", "cro"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Cancel a client (SRS §24.3) — SYS-3. One transaction (cancelClientPlan):
 * status → cancelled, future sessions cancelled, outstanding installments
 * waived (staff decision), portal login blocked, ActivityLog written. Client
 * data is retained.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!CANCELERS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: { clientId?: string; reason?: string; waiveOutstanding?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { clientId, reason } = body;
  if (!clientId) return json(req, { error: "clientId is required" }, 400);
  if (!reason?.trim()) return json(req, { error: "A cancellation reason is required" }, 400);

  // CROs may only cancel clients they are actively assigned to.
  if (authUser.role === "cro") {
    const assigned = await prisma.assignment.findFirst({
      where: { clientId, staffId: authUser.id, role: "cro", isActive: true },
      select: { id: true },
    });
    if (!assigned) return json(req, { error: "You are not assigned to this client" }, 403);
  }

  try {
    const result = await cancelClientPlan({
      clientId,
      reason,
      actorId: authUser.id,
      waiveOutstanding: body.waiveOutstanding !== false,
    });
    return json(req, { ok: true, ...result });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return json(req, { error: "Client not found" }, 404);
    if (msg === "ALREADY_CANCELLED") return json(req, { error: "Client is already cancelled" }, 409);
    if (msg === "COMPLETED") {
      return json(req, { error: "A completed client can't be cancelled" }, 409);
    }
    throw e;
  }
}

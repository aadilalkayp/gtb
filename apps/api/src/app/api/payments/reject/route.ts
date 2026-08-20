import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { rejectPaymentProof } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const APPROVERS = new Set(["founder", "ops_head", "cro"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Reject a submitted payment proof (SRS §8.3 step 6). MISC-1: the rejected
 * proof document link is kept for the audit trail (rejectPaymentProof).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!APPROVERS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: { installmentId?: string; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { installmentId, reason } = body;
  if (!installmentId) return json(req, { error: "installmentId is required" }, 400);
  if (!reason || !reason.trim()) return json(req, { error: "A reason is required" }, 400);

  const installment = await prisma.installment.findUnique({
    where: { id: installmentId },
    select: {
      id: true,
      clientPlan: { select: { client: { select: { id: true, userId: true } } } },
    },
  });
  if (!installment) return json(req, { error: "Installment not found" }, 404);

  const client = installment.clientPlan.client;
  if (authUser.role === "cro") {
    const assigned = await prisma.assignment.findFirst({
      where: { clientId: client.id, staffId: authUser.id, role: "cro", isActive: true },
      select: { id: true },
    });
    if (!assigned) return json(req, { error: "You are not assigned to this client" }, 403);
  }

  try {
    await rejectPaymentProof({ installmentId, reason, actorId: authUser.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return json(req, { error: "Installment not found" }, 404);
    if (msg === "NOT_SUBMITTED") {
      return json(req, { error: "Only a submitted proof can be rejected" }, 409);
    }
    throw e;
  }

  if (client.userId) {
    await notifyUsers([client.userId], {
      type: "payment_rejected",
      title: "Payment proof needs attention",
      body: reason.trim(),
      linkPath: "/portal/payments",
    });
  }

  return json(req, { ok: true });
}

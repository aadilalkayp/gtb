import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { approvePayment, PaymentConflictError, PaymentAmountError } from "@gtb/db/server";
import { PAYMENT_METHODS, type PaymentMethod } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers, getAdminUserIds } from "@/lib/notify";
import { generateReceiptForPayment } from "@/lib/paymentReceipt";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const APPROVERS = new Set(["founder", "ops_head", "cro"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Approve a client-submitted payment (SRS §8.3 / §8.5). Marks the payment
 * approved; the client's first-ever approved real payment converts them
 * Lead → Converted and notifies admins to assign a team.
 *
 * STATE-1: the write is a conditional update inside a transaction (see
 * approvePayment) — concurrent double-approvals can't double-write or
 * double-convert, and a balance guard rolls back an approval that would
 * overpay the plan.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!APPROVERS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: { paymentId?: string; paymentMethod?: string; notes?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { paymentId, paymentMethod, notes } = body;
  if (!paymentId) return json(req, { error: "paymentId is required" }, 400);
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    return json(req, { error: "A valid paymentMethod is required" }, 400);
  }

  // CROs may only act on clients they are actively assigned to.
  if (authUser.role === "cro") {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { clientPlan: { select: { client: { select: { id: true } } } } },
    });
    if (!payment) return json(req, { error: "Payment not found" }, 404);
    const assigned = await prisma.assignment.findFirst({
      where: { clientId: payment.clientPlan.client.id, staffId: authUser.id, role: "cro", isActive: true },
      select: { id: true },
    });
    if (!assigned) return json(req, { error: "You are not assigned to this client" }, 403);
  }

  let result;
  try {
    result = await approvePayment({
      paymentId,
      paymentMethod: paymentMethod as string,
      notes,
      actorId: authUser.id,
    });
  } catch (e) {
    if (e instanceof PaymentConflictError) {
      return json(req, { error: e.message }, 409);
    }
    if (e instanceof PaymentAmountError) {
      return json(req, { error: e.message }, 409);
    }
    if ((e as Error).message === "NOT_FOUND") {
      return json(req, { error: "Payment not found" }, 404);
    }
    throw e;
  }

  if (result.converted) {
    const admins = await getAdminUserIds();
    await notifyUsers(
      admins.filter((id) => id !== authUser.id),
      {
        type: "client_converted",
        title: "New converted client",
        body: `${result.client.name} has paid and is ready for team assignment.`,
        linkPath: "/assignments",
      },
    );
  }

  await generateReceiptForPayment(req, paymentId, authUser.id);

  return json(req, { ok: true, converted: result.converted });
}

export const POST = withRequestLog(handlePost);

import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { recordPayment, PaymentAmountError } from "@gtb/db/server";
import { PAYMENT_METHODS, type PaymentMethod } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers, getAdminUserIds } from "@/lib/notify";
import { generateReceiptForPayment } from "@/lib/paymentReceipt";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const RECORDERS = new Set(["founder", "ops_head", "cro"]);
const WAIVERS = new Set(["founder", "ops_head"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Staff records money received outside the portal (cash, a direct transfer),
 * or — founder/ops only — waives part of the balance (a discount or
 * write-off). Creates an already-approved Payment with the same balance guard
 * and first-payment conversion semantics as payments/approve (SRS §8.5).
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!RECORDERS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: {
    clientId?: string;
    amount?: number;
    paymentMethod?: string;
    kind?: string;
    notes?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { clientId, amount, paymentMethod, notes } = body;
  const kind = body.kind === "waiver" ? "waiver" : "payment";
  if (!clientId) return json(req, { error: "clientId is required" }, 400);
  if (typeof amount !== "number") return json(req, { error: "amount is required" }, 400);
  if (kind === "payment" && (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod as PaymentMethod))) {
    return json(req, { error: "A valid paymentMethod is required" }, 400);
  }
  if (kind === "waiver" && !WAIVERS.has(authUser.role)) {
    return json(req, { error: "Only founder/ops can waive amounts" }, 403);
  }

  // CROs may only record for clients they are actively assigned to.
  if (authUser.role === "cro") {
    const assigned = await prisma.assignment.findFirst({
      where: { clientId, staffId: authUser.id, role: "cro", isActive: true },
      select: { id: true },
    });
    if (!assigned) return json(req, { error: "You are not assigned to this client" }, 403);
  }

  let result;
  try {
    result = await recordPayment({
      clientId,
      amount,
      paymentMethod,
      kind,
      notes,
      actorId: authUser.id,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof PaymentAmountError) return json(req, { error: e.message }, 400);
    if (msg === "NO_PLAN") return json(req, { error: "This client has no plan enrolled" }, 404);
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

  await generateReceiptForPayment(req, result.paymentId, authUser.id);

  return json(req, { ok: true, converted: result.converted, paymentId: result.paymentId });
}

export const POST = withRequestLog(handlePost);

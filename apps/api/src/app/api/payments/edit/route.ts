import type { NextRequest } from "next/server";
import { editPayment } from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { generateReceiptForPayment, removeReceiptForPayment } from "@/lib/paymentReceipt";
import { correctionErrorResponse } from "@/lib/paymentCorrectionErrors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const EDITORS = new Set(["founder", "ops_head", "cro"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Correct the details of any payment record (amount, method, received date,
 * notes, payment vs waiver). Founder/ops on every payment; CROs on their
 * assigned clients' payments, never waivers. A reason is required and the
 * before/after is audit-logged. An approved payment's receipt is regenerated.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!EDITORS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: {
    paymentId?: string;
    reason?: string;
    amount?: number;
    paymentMethod?: string | null;
    paidAt?: string;
    notes?: string | null;
    kind?: "payment" | "waiver";
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!body.paymentId) return json(req, { error: "paymentId is required" }, 400);
  if (body.kind !== undefined && body.kind !== "payment" && body.kind !== "waiver") {
    return json(req, { error: "kind must be payment or waiver" }, 400);
  }

  try {
    const { receipt } = await editPayment({
      paymentId: body.paymentId,
      actor: { id: authUser.id, role: authUser.role },
      reason: body.reason ?? "",
      amount: body.amount === undefined ? undefined : Number(body.amount),
      paymentMethod: body.paymentMethod,
      paidAt: body.paidAt === undefined ? undefined : new Date(body.paidAt),
      notes: body.notes,
      kind: body.kind,
    });
    if (receipt === "regenerate") {
      await generateReceiptForPayment(req, body.paymentId, authUser.id, { replace: true });
    } else if (receipt === "remove") {
      await removeReceiptForPayment(req, body.paymentId);
    }
    return json(req, { ok: true });
  } catch (e) {
    const mapped = correctionErrorResponse(e);
    if (mapped) return json(req, { error: mapped.error }, mapped.status);
    throw e;
  }
}

export const POST = withRequestLog(handlePost);

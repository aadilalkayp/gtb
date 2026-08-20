import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { approveInstallment, PaymentConflictError } from "@gtb/db/server";
import { PAYMENT_METHODS, type PaymentMethod } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { notifyUsers, getAdminUserIds } from "@/lib/notify";
import { createPaymentReceipt } from "@/lib/receipt";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const APPROVERS = new Set(["founder", "ops_head", "cro"]);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

/**
 * Approve (or manually record) a payment (SRS §8.3 / §8.5). Marks the
 * installment approved; the client's first-ever approval converts them
 * Lead → Converted and notifies admins to assign a team.
 *
 * STATE-1: the write is a conditional update inside a transaction (see
 * approveInstallment) — concurrent double-approvals can't double-write or
 * double-convert, and a crash can't leave an approved-but-never-converted
 * client.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return json(req, { error: "Unauthorized" }, 401);
  if (!APPROVERS.has(authUser.role)) return json(req, { error: "Forbidden" }, 403);

  let body: { installmentId?: string; paymentMethod?: string; notes?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { installmentId, paymentMethod, notes } = body;
  if (!installmentId) return json(req, { error: "installmentId is required" }, 400);
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    return json(req, { error: "A valid paymentMethod is required" }, 400);
  }

  // CROs may only act on clients they are actively assigned to.
  if (authUser.role === "cro") {
    const installment = await prisma.installment.findUnique({
      where: { id: installmentId },
      select: { clientPlan: { select: { client: { select: { id: true } } } } },
    });
    if (!installment) return json(req, { error: "Installment not found" }, 404);
    const assigned = await prisma.assignment.findFirst({
      where: { clientId: installment.clientPlan.client.id, staffId: authUser.id, role: "cro", isActive: true },
      select: { id: true },
    });
    if (!assigned) return json(req, { error: "You are not assigned to this client" }, 403);
  }

  let result;
  try {
    result = await approveInstallment({
      installmentId,
      paymentMethod: paymentMethod as string,
      notes,
      actorId: authUser.id,
    });
  } catch (e) {
    if (e instanceof PaymentConflictError) {
      return json(req, { error: e.message }, 409);
    }
    if ((e as Error).message === "NOT_FOUND") {
      return json(req, { error: "Installment not found" }, 404);
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

  // FEAT-1: generate + store the payment receipt PDF (SRS §8.7). Best-effort —
  // a storage failure must not fail the approval itself.
  try {
    const installment = await prisma.installment.findUnique({
      where: { id: installmentId },
      include: {
        clientPlan: {
          select: { clientId: true, planNameSnapshot: true, client: { select: { name: true, clientCode: true } } },
        },
      },
    });
    if (installment) {
      const stored = await createPaymentReceipt({
        clientName: installment.clientPlan.client.name,
        clientCode: installment.clientPlan.client.clientCode,
        planName: installment.clientPlan.planNameSnapshot,
        installmentNumber: installment.installmentNumber,
        amount: installment.amount,
        paymentMethod: paymentMethod as string,
        paidAt: new Date(),
        receiptId: installment.id,
      });
      if (stored) {
        await prisma.document.create({
          data: {
            clientId: installment.clientPlan.clientId,
            type: "payment_receipt",
            fileName: `payment-receipt-${installment.installmentNumber}.pdf`,
            fileUrl: stored.fileUrl,
            fileSize: stored.fileSize,
            uploadedById: authUser.id,
          },
        });
      }
    }
  } catch (e) {
    console.error("[GTB OS] Receipt generation failed:", e instanceof Error ? e.message : e);
  }

  return json(req, { ok: true, converted: result.converted });
}

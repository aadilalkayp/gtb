import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { createPaymentReceipt } from "@/lib/receipt";
import { requestLog } from "@/lib/logger";

/**
 * FEAT-1: generate + store the receipt PDF for an approved payment (SRS §8.7).
 * Best-effort — a storage failure must never fail the approval itself. Shared
 * by payments/approve and payments/record. Waivers get no receipt (no money
 * changed hands).
 */
export async function generateReceiptForPayment(
  req: NextRequest,
  paymentId: string,
  actorId: string,
): Promise<void> {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        clientPlan: {
          select: {
            id: true,
            clientId: true,
            planNameSnapshot: true,
            priceAtEnrollment: true,
            client: { select: { name: true, clientCode: true } },
            payments: {
              where: { status: "approved" },
              select: { id: true, amount: true, approvedAt: true, createdAt: true },
              orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
    });
    if (!payment || payment.status !== "approved" || payment.kind !== "payment") return;

    const approved = payment.clientPlan.payments;
    const paymentNumber = Math.max(approved.findIndex((p) => p.id === payment.id) + 1, 1);
    const approvedTotal = approved.reduce((t, p) => t + p.amount, 0);

    const stored = await createPaymentReceipt({
      clientName: payment.clientPlan.client.name,
      clientCode: payment.clientPlan.client.clientCode,
      planName: payment.clientPlan.planNameSnapshot,
      paymentNumber,
      amount: payment.amount,
      balanceAfter: Math.max(payment.clientPlan.priceAtEnrollment - approvedTotal, 0),
      paymentMethod: payment.paymentMethod ?? "other",
      paidAt: payment.approvedAt ?? new Date(),
      receiptId: payment.id,
    });
    if (stored) {
      await prisma.document.create({
        data: {
          clientId: payment.clientPlan.clientId,
          type: "payment_receipt",
          fileName: `payment-receipt-${paymentNumber}.pdf`,
          fileUrl: stored.fileUrl,
          fileSize: stored.fileSize,
          uploadedById: actorId,
        },
      });
    }
  } catch (e) {
    requestLog(req).error("receipt generation failed", { error: e });
  }
}

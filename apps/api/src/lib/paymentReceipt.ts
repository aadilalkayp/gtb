import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { createPaymentReceipt } from "@/lib/receipt";
import { deleteObjects } from "@/lib/storage";
import { requestLog } from "@/lib/logger";

/**
 * FEAT-1: generate + store the receipt PDF for an approved payment (SRS §8.7).
 * Best-effort — a storage failure must never fail the approval itself. Shared
 * by payments/approve and payments/record. Waivers get no receipt (no money
 * changed hands). With `replace` (a staff correction to an approved payment)
 * the PDF is regenerated in place and its existing Document row updated.
 */
export async function generateReceiptForPayment(
  req: NextRequest,
  paymentId: string,
  actorId: string,
  opts: { replace?: boolean } = {},
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
            agreedPrice: true,
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

    const stored = await createPaymentReceipt(
      {
        clientName: payment.clientPlan.client.name,
        clientCode: payment.clientPlan.client.clientCode,
        planName: payment.clientPlan.planNameSnapshot,
        paymentNumber,
        amount: payment.amount,
        balanceAfter:
          payment.clientPlan.agreedPrice == null
            ? null
            : Math.max(payment.clientPlan.agreedPrice - approvedTotal, 0),
        paymentMethod: payment.paymentMethod ?? "other",
        paidAt: payment.approvedAt ?? new Date(),
        receiptId: payment.id,
      },
      opts,
    );
    if (stored && opts.replace) {
      const existing = await prisma.document.findFirst({
        where: { type: "payment_receipt", fileUrl: stored.fileUrl },
        select: { id: true },
      });
      if (existing) {
        await prisma.document.update({
          where: { id: existing.id },
          data: { fileSize: stored.fileSize },
        });
        return;
      }
    }
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

/**
 * Drop the receipt of a payment that is no longer approved (moved back to
 * review, rejected or voided), so the client's documents never show a receipt
 * for money that doesn't count. Best-effort, like generation.
 */
export async function removeReceiptForPayment(req: NextRequest, paymentId: string): Promise<void> {
  try {
    const docs = await prisma.document.findMany({
      where: {
        type: "payment_receipt",
        fileUrl: { endsWith: `/payment_receipt/${paymentId}.pdf` },
      },
      select: { id: true, fileUrl: true },
    });
    if (!docs.length) return;
    await prisma.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
    await deleteObjects(docs.map((d) => d.fileUrl));
  } catch (e) {
    requestLog(req).error("receipt removal failed", { error: e });
  }
}

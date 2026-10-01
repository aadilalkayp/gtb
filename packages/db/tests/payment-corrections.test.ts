import { describe, expect, it } from "vitest";
import { planPaymentPace } from "@gtb/shared";
import { prisma } from "../src/index.js";
import { editPayment, changePaymentStatus, PaymentCorrectionError } from "../src/server/index.js";
import {
  seedUser,
  seedClient,
  seedPlan,
  seedClientPlan,
  seedPayment,
  seedAssignment,
} from "./helpers.js";

const OPS = { id: "ops1", role: "ops_head" };
const CRO = { id: "cro1", role: "cro" };

async function scene(opts: { agreedPrice?: number | null } = {}) {
  await seedUser({ id: "ops1", role: "ops_head" });
  await seedUser({ id: "cro1", role: "cro" });
  await seedUser({ id: "cro2", role: "cro" });
  const c = await seedClient({ id: "c1", status: "converted" });
  await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
  const plan = await seedPlan();
  const cp = await seedClientPlan(c.id, plan.id, { agreedPrice: opts.agreedPrice });
  const approved = await prisma.payment.create({
    data: {
      clientPlanId: cp.id,
      amount: 30000,
      status: "approved",
      paymentMethod: "upi",
      approvedAt: new Date("2026-08-01T00:00:00.000Z"),
      legacyImported: true,
    },
  });
  return { c, cp, approved };
}

async function approvedTotal(clientPlanId: string) {
  const rows = await prisma.payment.findMany({ where: { clientPlanId } });
  return planPaymentPace(90000, [], rows, new Date()).paidTotal;
}

describe("editPayment — correcting an approved record", () => {
  it("fixes a legacy over-approved amount; totals follow and the edit is audit-logged", async () => {
    const { cp, approved } = await scene();
    const res = await editPayment({
      paymentId: approved.id,
      actor: OPS,
      amount: 12000,
      reason: "Client only paid 12k of the first installment",
    });
    expect(res.receipt).toBe("regenerate");
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: approved.id } });
    expect(row).toMatchObject({ amount: 12000, status: "approved", editedById: "ops1" });
    expect(row.editedAt).not.toBeNull();
    expect(await approvedTotal(cp.id)).toBe(12000);
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "payment", entityId: approved.id, summary: "Payment edited" },
    });
    expect(log.changes).toMatchObject({
      reason: "Client only paid 12k of the first installment",
      before: { amount: 30000 },
      after: { amount: 12000 },
    });
  });

  it("edits the method, received date and notes", async () => {
    const { approved } = await scene();
    await editPayment({
      paymentId: approved.id,
      actor: OPS,
      paymentMethod: "cash",
      paidAt: new Date("2026-07-15T00:00:00.000Z"),
      notes: "Paid at the studio",
      reason: "Wrong method recorded",
    });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: approved.id } });
    expect(row.paymentMethod).toBe("cash");
    expect(row.approvedAt?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(row.notes).toBe("Paid at the studio");
  });

  it("requires a reason and an actual change", async () => {
    const { approved } = await scene();
    await expect(
      editPayment({ paymentId: approved.id, actor: OPS, amount: 1000, reason: "  " }),
    ).rejects.toBeInstanceOf(PaymentCorrectionError);
    await expect(
      editPayment({ paymentId: approved.id, actor: OPS, amount: 30000, reason: "no-op" }),
    ).rejects.toThrow("Nothing was changed");
  });

  it("won't push approved money past the agreed price", async () => {
    const { approved } = await scene();
    await expect(
      editPayment({ paymentId: approved.id, actor: OPS, amount: 95000, reason: "typo" }),
    ).rejects.toThrow("past the agreed price");
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: approved.id } });
    expect(row.amount).toBe(30000);
  });

  it("turns a payment into a waiver (founder/ops) and drops its receipt", async () => {
    const { approved } = await scene();
    const res = await editPayment({
      paymentId: approved.id,
      actor: OPS,
      kind: "waiver",
      reason: "Was a discount",
    });
    expect(res.receipt).toBe("remove");
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: approved.id } });
    expect(row).toMatchObject({ kind: "waiver", paymentMethod: null });
  });

  it("scopes CROs to their assigned clients and keeps waivers off-limits", async () => {
    const { approved, cp } = await scene();
    await editPayment({
      paymentId: approved.id,
      actor: CRO,
      amount: 20000,
      reason: "Correct amount",
    });
    await expect(
      editPayment({
        paymentId: approved.id,
        actor: { id: "cro2", role: "cro" },
        amount: 10000,
        reason: "x",
      }),
    ).rejects.toThrow("NOT_ASSIGNED");
    await expect(
      editPayment({ paymentId: approved.id, actor: CRO, kind: "waiver", reason: "x" }),
    ).rejects.toThrow("FORBIDDEN");
    const waiver = await seedPayment(cp.id, { status: "approved", kind: "waiver", amount: 5000 });
    await expect(
      editPayment({ paymentId: waiver.id, actor: CRO, amount: 4000, reason: "x" }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      editPayment({
        paymentId: approved.id,
        actor: { id: "x", role: "coach" },
        amount: 1,
        reason: "x",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("changePaymentStatus — reversing a decision", () => {
  it("moves an approved payment back to review without touching the client's status", async () => {
    const { c, cp, approved } = await scene();
    const res = await changePaymentStatus({
      paymentId: approved.id,
      actor: OPS,
      to: "pending_review",
      reason: "Approved by mistake, proof unclear",
    });
    expect(res).toEqual({ receipt: "remove", from: "approved" });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: approved.id } });
    expect(row).toMatchObject({ status: "pending_review", approvedAt: null, approvedById: null });
    expect(await approvedTotal(cp.id)).toBe(0);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(client.status).toBe("converted");
  });

  it("rejects an approved payment with the reason as the rejection reason", async () => {
    const { approved } = await scene();
    await changePaymentStatus({
      paymentId: approved.id,
      actor: CRO,
      to: "rejected",
      reason: "Bounced",
    });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: approved.id } });
    expect(row).toMatchObject({ status: "rejected", rejectionReason: "Bounced" });
  });

  it("voids a record (kept for audit, out of every total) and voided is final", async () => {
    const { cp, approved } = await scene();
    await changePaymentStatus({
      paymentId: approved.id,
      actor: OPS,
      to: "voided",
      reason: "Duplicate entry",
    });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: approved.id } });
    expect(row).toMatchObject({ status: "voided", voidReason: "Duplicate entry" });
    expect(await approvedTotal(cp.id)).toBe(0);
    await expect(
      changePaymentStatus({
        paymentId: approved.id,
        actor: OPS,
        to: "pending_review",
        reason: "x",
      }),
    ).rejects.toThrow("can't be changed");
    await expect(
      editPayment({ paymentId: approved.id, actor: OPS, amount: 1, reason: "x" }),
    ).rejects.toThrow("voided payment can't be edited");
  });

  it("reopens a rejected payment for review", async () => {
    const { cp } = await scene();
    const rejected = await seedPayment(cp.id, { status: "rejected", amount: 5000 });
    await changePaymentStatus({
      paymentId: rejected.id,
      actor: OPS,
      to: "pending_review",
      reason: "Rejected by mistake",
    });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: rejected.id } });
    expect(row).toMatchObject({ status: "pending_review", rejectionReason: null });
  });

  it("waivers can only be voided", async () => {
    const { cp } = await scene();
    const waiver = await seedPayment(cp.id, { status: "approved", kind: "waiver", amount: 5000 });
    await expect(
      changePaymentStatus({ paymentId: waiver.id, actor: OPS, to: "pending_review", reason: "x" }),
    ).rejects.toBeInstanceOf(PaymentCorrectionError);
    await changePaymentStatus({
      paymentId: waiver.id,
      actor: OPS,
      to: "voided",
      reason: "Wrong client",
    });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: waiver.id } });
    expect(row.status).toBe("voided");
  });
});

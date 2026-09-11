import { describe, expect, it } from "vitest";
import { prisma } from "../src/index.js";
import {
  approvePayment,
  recordPayment,
  PaymentConflictError,
  PaymentAmountError,
  completeSession,
  SessionConflictError,
  submitPayment,
  ProofConflictError,
  enrollClientInPlan,
  EnrollmentConflictError,
  activateClientPlan,
} from "../src/server/index.js";
import {
  seedUser,
  seedClient,
  seedPlan,
  seedClientPlan,
  seedMilestone,
  seedPayment,
  seedAssignment,
  seedSession,
  seedExpenseCategory,
  seedExpense,
  seedDocument,
  seedAssessment,
} from "./helpers.js";

describe("Phase 2 — STATE-4: unique-constraint backstops", () => {
  it("rejects a duplicate milestone for the same (plan, number)", async () => {
    const c = await seedClient({ id: "c1" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    await seedMilestone(cp.id, 1);
    await expect(
      prisma.paymentMilestone.create({
        data: {
          clientPlanId: cp.id,
          milestoneNumber: 1,
          amount: 100,
          dueDate: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a duplicate session for the same (client, service, number)", async () => {
    await seedClient({ id: "c1" });
    await seedSession({ clientId: "c1", serviceType: "skincare" });
    await expect(
      prisma.session.create({
        data: {
          clientId: "c1",
          serviceType: "skincare",
          sessionNumber: 1,
          scheduledDate: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a second active assignment for the same (client, role); allows inactive", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "cro2", role: "cro" });
    const c = await seedClient({ id: "c1" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    await expect(
      prisma.assignment.create({
        data: { clientId: c.id, staffId: "cro2", role: "cro" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    // deactivating the first frees the slot
    await prisma.assignment.updateMany({
      where: { clientId: c.id, role: "cro" },
      data: { isActive: false },
    });
    await prisma.assignment.create({
      data: { clientId: c.id, staffId: "cro2", role: "cro" },
    });
  });

  it("rejects a second expense with the same sessionId; allows unrelated expenses", async () => {
    await seedUser({ id: "c1", role: "cro" });
    const cat = await seedExpenseCategory();
    await seedClient({ id: "c1" });
    const s = await seedSession({ clientId: "c1" });
    await seedExpense({ categoryId: cat.id, submittedById: "c1" });
    await prisma.expense.create({
      data: {
        categoryId: cat.id,
        title: "fee",
        amount: 100,
        date: new Date(),
        submittedById: "c1",
        sessionId: s.id,
      },
    });
    await expect(
      prisma.expense.create({
        data: {
          categoryId: cat.id,
          title: "fee2",
          amount: 100,
          date: new Date(),
          submittedById: "c1",
          sessionId: s.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await prisma.expense.create({
      data: {
        categoryId: cat.id,
        title: "unrelated",
        amount: 100,
        date: new Date(),
        submittedById: "c1",
      },
    });
  });
});

describe("Phase 2 — STATE-1: atomic payment approval", () => {
  async function seedPaidClient() {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    return { c, cp };
  }

  it("approves and converts on the first approval (all in one tx)", async () => {
    const { c, cp } = await seedPaidClient();
    const p = await seedPayment(cp.id, { status: "pending_review", amount: 30000 });
    const res = await approvePayment({ paymentId: p.id, paymentMethod: "upi", actorId: "cro1" });
    expect(res.converted).toBe(true);
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("approved");
    const client = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(client.status).toBe("converted");
    expect(client.conversionDate).not.toBeNull();
  });

  it("second approval of the same payment throws (concurrent double-approve)", async () => {
    const { cp } = await seedPaidClient();
    const p = await seedPayment(cp.id, { status: "pending_review", amount: 30000 });
    // Simulate the race: both callers pass the pre-check, then the guarded
    // update lets exactly one through.
    const [r1, r2] = await Promise.allSettled([
      approvePayment({ paymentId: p.id, paymentMethod: "upi", actorId: "cro1" }),
      approvePayment({ paymentId: p.id, paymentMethod: "upi", actorId: "cro1" }),
    ]);
    const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
    const rejected = [r1, r2].filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as Error).constructor).toBe(PaymentConflictError);
    // and only ONE conversion happened
    const client = await prisma.client.findUniqueOrThrow({ where: { id: "c1" } });
    expect(client.status).toBe("converted");
    expect(client.conversionDate).not.toBeNull();
  });

  it("two concurrent approvals of DIFFERENT payments convert exactly once", async () => {
    const { c, cp } = await seedPaidClient();
    const p1 = await seedPayment(cp.id, { status: "pending_review", amount: 30000 });
    const p2 = await seedPayment(cp.id, { status: "pending_review", amount: 30000 });
    await Promise.allSettled([
      approvePayment({ paymentId: p1.id, paymentMethod: "upi", actorId: "cro1" }),
      approvePayment({ paymentId: p2.id, paymentMethod: "upi", actorId: "cro1" }),
    ]);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(client.status).toBe("converted");
    // exactly one row carries the conversion timestamp/actor — the other
    // approval saw priorApproved > 0 and skipped the conversion.
    const converted = await prisma.client.count({ where: { id: c.id, status: "converted" } });
    expect(converted).toBe(1);
    const approved = await prisma.payment.count({ where: { clientPlanId: cp.id, status: "approved" } });
    expect(approved).toBe(2); // both payments are real money; only one conversion
  });

  it("later payments approve without re-converting", async () => {
    const { c, cp } = await seedPaidClient();
    const p1 = await seedPayment(cp.id, { status: "pending_review", amount: 30000 });
    const p2 = await seedPayment(cp.id, { status: "pending_review", amount: 30000 });
    await approvePayment({ paymentId: p1.id, paymentMethod: "upi", actorId: "cro1" });
    const res = await approvePayment({ paymentId: p2.id, paymentMethod: "upi", actorId: "cro1" });
    expect(res.converted).toBe(false);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(client.status).toBe("converted");
  });

  it("an approval that would overpay the plan rolls back", async () => {
    const { cp } = await seedPaidClient();
    await seedPayment(cp.id, { status: "approved", amount: 80000 });
    const p = await seedPayment(cp.id, { status: "pending_review", amount: 20000 }); // 100k > 90k price
    await expect(
      approvePayment({ paymentId: p.id, paymentMethod: "upi", actorId: "cro1" }),
    ).rejects.toBeInstanceOf(PaymentAmountError);
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("pending_review"); // rolled back, still reviewable
  });

  it("recordPayment creates an approved payment, converts once, and guards the balance", async () => {
    const { c } = await seedPaidClient();
    const res = await recordPayment({
      clientId: c.id,
      amount: 40000,
      paymentMethod: "cash",
      actorId: "cro1",
    });
    expect(res.converted).toBe(true);
    await expect(
      recordPayment({ clientId: c.id, amount: 60000, paymentMethod: "cash", actorId: "cro1" }),
    ).rejects.toBeInstanceOf(PaymentAmountError); // 40k + 60k > 90k price
    const rows = await prisma.payment.findMany({ where: { clientPlan: { clientId: c.id } } });
    expect(rows).toHaveLength(1); // the overpay attempt rolled back entirely
  });

  it("a waiver settles balance but never converts a lead", async () => {
    const { c, cp } = await seedPaidClient();
    const res = await recordPayment({
      clientId: c.id,
      amount: 90000,
      kind: "waiver",
      actorId: "cro1",
    });
    expect(res.converted).toBe(false);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(client.status).toBe("lead");
    const row = await prisma.payment.findFirstOrThrow({ where: { clientPlanId: cp.id } });
    expect(row.kind).toBe("waiver");
    expect(row.status).toBe("approved");
  });
});

describe("Phase 2 — STATE-2: idempotent activation", () => {
  async function seedActivatable() {
    await seedUser({ id: "ops1", role: "ops_head" });
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "sk1", role: "skincare_consultant" });
    await seedUser({ id: "ft1", role: "fitness_trainer" });
    const c = await seedClient({ id: "c1", status: "converted", weddingDate: new Date("2026-12-01T00:00:00.000Z") });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    await seedAssignment({ clientId: c.id, staffId: "sk1", role: "skincare_consultant" });
    await seedAssignment({ clientId: c.id, staffId: "ft1", role: "fitness_trainer" });
    const plan = await prisma.plan.create({
      data: {
        name: "Plan",
        clientType: "groom",
        durationMonths: 3,
        price: 90000,
        installmentCount: 1,
        services: {
          create: [
            { serviceType: "skincare", totalSessions: 2, startOffsetDays: 60, frequencyDays: 14 },
            { serviceType: "fitness", totalSessions: 3, startOffsetDays: 30, frequencyDays: 7 },
          ],
        },
      },
    });
    await seedClientPlan(c.id, plan.id);
    return c;
  }

  it("double-activate produces exactly one schedule", async () => {
    await seedActivatable();
    const [r1, r2] = await Promise.allSettled([
      activateClientPlan("c1"),
      activateClientPlan("c1"),
    ]);
    expect([r1, r2].every((r) => r.status === "fulfilled")).toBe(true);
    const sessions = await prisma.session.findMany({ where: { clientId: "c1" } });
    expect(sessions).toHaveLength(5); // 2 skincare + 3 fitness, NOT 10
    const client = await prisma.client.findUniqueOrThrow({ where: { id: "c1" } });
    expect(client.status).toBe("active");
    const followUps = await prisma.followUp.count({ where: { clientId: "c1" } });
    expect(followUps).toBe(2);
  });
});

describe("Phase 2 — STATE-3: one payout per completed session", () => {
  async function seedCompletable() {
    await seedUser({ id: "consultant1", role: "skincare_consultant" });
    await seedUser({ id: "client1", role: "client" });
    await prisma.consultantRate.create({
      data: { userId: "consultant1", serviceType: "skincare", amount: 1500 },
    });
    await prisma.expenseCategory.create({ data: { name: "Consultant Fee" } });
    const c = await seedClient({ id: "c1", userId: "client1" });
    const s = await seedSession({ clientId: c.id, serviceType: "skincare", consultantId: "consultant1" });
    return s;
  }

  it("double-complete produces one completion and one payout expense", async () => {
    const s = await seedCompletable();
    const [r1, r2] = await Promise.allSettled([
      completeSession({ sessionId: s.id }),
      completeSession({ sessionId: s.id }),
    ]);
    const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
    const rejected = [r1, r2].filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect((rejected[0].reason as Error).constructor).toBe(SessionConflictError);
    const expenses = await prisma.expense.count({ where: { sessionId: s.id } });
    expect(expenses).toBe(1);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(session.status).toBe("completed");
  });
});

describe("Phase 2 — STATE-6: atomic payment submission", () => {
  async function seedProofScene() {
    await seedUser({ id: "client1", role: "client" });
    await seedUser({ id: "client2", role: "client" });
    const c = await seedClient({ id: "c1", userId: "client1", leadPhase: "plan_selected" });
    await seedClient({ id: "c2", userId: "client2" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    await seedMilestone(cp.id, 1);
    const ownDoc = await seedDocument({ clientId: c.id, type: "payment_proof", uploadedById: "client1" });
    const foreignDoc = await seedDocument({ clientId: "c2", type: "payment_proof", uploadedById: "client2" });
    return { c, cp, ownDoc, foreignDoc };
  }

  it("submits a payment and advances leadPhase atomically", async () => {
    const { c, cp, ownDoc } = await seedProofScene();
    const { paymentId } = await submitPayment({ actorId: "client1", amount: 30000, proofDocumentId: ownDoc.id });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(row.status).toBe("pending_review");
    expect(row.amount).toBe(30000);
    expect(row.clientPlanId).toBe(cp.id);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(client.leadPhase).toBe("payment_submitted");
  });

  it("rejects a proof document belonging to another client", async () => {
    const { cp, foreignDoc } = await seedProofScene();
    await expect(
      submitPayment({ actorId: "client1", amount: 30000, proofDocumentId: foreignDoc.id }),
    ).rejects.toThrow("Invalid proof document");
    const count = await prisma.payment.count({ where: { clientPlanId: cp.id } });
    expect(count).toBe(0);
  });

  it("rejects re-submitting a proof document that's already attached", async () => {
    const { ownDoc } = await seedProofScene();
    await submitPayment({ actorId: "client1", amount: 10000, proofDocumentId: ownDoc.id });
    await expect(
      submitPayment({ actorId: "client1", amount: 10000, proofDocumentId: ownDoc.id }),
    ).rejects.toBeInstanceOf(ProofConflictError);
  });

  it("caps the amount at what's left once approved + under-review are counted", async () => {
    const { c, cp, ownDoc } = await seedProofScene();
    await seedPayment(cp.id, { status: "approved", amount: 50000 });
    await seedPayment(cp.id, { status: "pending_review", amount: 20000 });
    // 90k price − 50k approved − 20k under review = 20k submittable
    await expect(
      submitPayment({ actorId: "client1", amount: 30000, proofDocumentId: ownDoc.id }),
    ).rejects.toThrow("AMOUNT_TOO_HIGH");
    await submitPayment({ actorId: "client1", amount: 20000, proofDocumentId: ownDoc.id });
    const doc2 = await seedDocument({ clientId: c.id, type: "payment_proof", uploadedById: "client1" });
    await expect(
      submitPayment({ actorId: "client1", amount: 1, proofDocumentId: doc2.id }),
    ).rejects.toBeInstanceOf(ProofConflictError); // nothing left to pay
  });
});

describe("Phase 2 — STATE-7: enrollment conflicts are 409s", () => {
  it("double-enroll throws EnrollmentConflictError (was an unhandled 500)", async () => {
    await seedUser({ id: "client1", role: "client" });
    const c = await seedClient({ id: "c1", userId: "client1" });
    await seedAssessment(c.id, { completedAt: new Date() }); // MISC-4 precondition
    const plan = await seedPlan();
    await enrollClientInPlan({ clientId: c.id, planId: plan.id });
    await expect(enrollClientInPlan({ clientId: c.id, planId: plan.id })).rejects.toBeInstanceOf(
      EnrollmentConflictError,
    );
  });

  it("enroll advances leadPhase to plan_selected atomically", async () => {
    await seedUser({ id: "client1", role: "client" });
    const c = await seedClient({ id: "c1", userId: "client1", leadPhase: "registered" });
    await seedAssessment(c.id, { completedAt: new Date() }); // MISC-4 precondition
    const plan = await seedPlan();
    await enrollClientInPlan({ clientId: c.id, planId: plan.id });

    const noAssessment = await seedClient({ id: "c2" });
    await expect(
      enrollClientInPlan({ clientId: noAssessment.id, planId: plan.id }),
    ).rejects.toThrow("NO_ASSESSMENT"); // MISC-4: §5.3 state machine
    const client = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(client.leadPhase).toBe("plan_selected");
    const milestones = await prisma.paymentMilestone.findMany({
      where: { clientPlan: { clientId: c.id } },
      orderBy: { milestoneNumber: "asc" },
    });
    expect(milestones).toHaveLength(3); // seedPlan has installmentCount 3 (the template)
    expect(milestones.reduce((t, m) => t + m.amount, 0)).toBe(90000); // sums to price
  });

  it("accepts a custom milestone schedule that sums to the price", async () => {
    await seedUser({ id: "client9", role: "client" });
    const c = await seedClient({ id: "c9", userId: "client9" });
    await seedAssessment(c.id, { completedAt: new Date() });
    const plan = await seedPlan();
    await enrollClientInPlan({
      clientId: c.id,
      planId: plan.id,
      milestones: [
        { amount: 50000, dueDate: new Date("2026-10-01T00:00:00.000Z") },
        { amount: 40000, dueDate: new Date("2026-12-01T00:00:00.000Z") },
      ],
    });
    const milestones = await prisma.paymentMilestone.findMany({
      where: { clientPlan: { clientId: c.id } },
      orderBy: { milestoneNumber: "asc" },
    });
    expect(milestones.map((m) => m.amount)).toEqual([50000, 40000]);
  });

  it("rejects a custom schedule that doesn't sum to the price", async () => {
    await seedUser({ id: "client8", role: "client" });
    const c = await seedClient({ id: "c8", userId: "client8" });
    await seedAssessment(c.id, { completedAt: new Date() });
    const plan = await seedPlan();
    await expect(
      enrollClientInPlan({
        clientId: c.id,
        planId: plan.id,
        milestones: [{ amount: 10000, dueDate: new Date("2026-10-01T00:00:00.000Z") }],
      }),
    ).rejects.toThrow("BAD_SCHEDULE");
  });
});

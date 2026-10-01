import { describe, expect, it } from "vitest";
import {
  approvedTotal,
  approvedCashTotal,
  planBalance,
  milestonePace,
  planPaymentPace,
  validateMilestoneSchedule,
} from "@gtb/shared";
import { prisma } from "../src/index.js";
import { updateMilestoneSchedule } from "../src/server/index.js";
import { seedUser, seedClient, seedPlan, seedClientPlan, seedMilestone } from "./helpers.js";

const TODAY = new Date("2026-09-10T00:00:00.000Z");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("shared — pace derivations (the subtle part)", () => {
  const milestones = [
    { amount: 30000, dueDate: d("2026-08-01") }, // past
    { amount: 30000, dueDate: d("2026-09-01") }, // past
    { amount: 30000, dueDate: d("2026-11-01") }, // future
  ];

  it("totals: waivers settle balance but are not cash", () => {
    const payments = [
      { amount: 20000, status: "approved", kind: "payment" },
      { amount: 10000, status: "approved", kind: "waiver" },
      { amount: 5000, status: "pending_review", kind: "payment" },
      { amount: 7000, status: "rejected", kind: "payment" },
    ];
    expect(approvedTotal(payments)).toBe(30000);
    expect(approvedCashTotal(payments)).toBe(20000);
    expect(planBalance(90000, payments)).toBe(60000);
  });

  it("odd-sized chunks that cover the cumulative expected are never behind", () => {
    // Paid 61k in odd chunks: covers m1 (30k) and m2 (cumulative 60k).
    const payments = [
      { amount: 45000, status: "approved" },
      { amount: 16000, status: "approved" },
    ];
    const pace = milestonePace(milestones, payments, TODAY);
    expect(pace.map((p) => p.status)).toEqual(["paid", "paid", "upcoming"]);
    expect(pace[2].remaining).toBe(29000); // 1k of m3 already covered
  });

  it("a shortfall at a passed checkpoint is behind — for the uncovered part only", () => {
    const payments = [{ amount: 40000, status: "approved" }];
    const pace = milestonePace(milestones, payments, TODAY);
    expect(pace.map((p) => p.status)).toEqual(["paid", "behind", "upcoming"]);
    expect(pace[1].remaining).toBe(20000); // 60k expected by now, 40k paid
  });

  it("a milestone due today is upcoming, not behind (strictly-past rule)", () => {
    const pace = milestonePace(
      [{ amount: 1000, dueDate: TODAY }],
      [],
      TODAY,
    );
    expect(pace[0].status).toBe("upcoming");
  });

  it("plan rollup: behindAmount, nextDue and status", () => {
    const payments = [{ amount: 40000, status: "approved" }];
    const pace = planPaymentPace(90000, milestones, payments, TODAY);
    expect(pace.paidTotal).toBe(40000);
    expect(pace.balance).toBe(50000);
    expect(pace.behindAmount).toBe(20000);
    expect(pace.status).toBe("behind");
    expect(pace.nextDue).toEqual({ dueDate: milestones[1].dueDate, remaining: 20000 });
  });

  it("behindAmount never exceeds the balance", () => {
    // All checkpoints passed, 85k of 90k paid: nominal shortfall is 90k−85k.
    const all = [
      { amount: 45000, dueDate: d("2026-07-01") },
      { amount: 45000, dueDate: d("2026-08-01") },
    ];
    const pace = planPaymentPace(90000, all, [{ amount: 85000, status: "approved" }], TODAY);
    expect(pace.behindAmount).toBe(5000);
    expect(pace.balance).toBe(5000);
  });

  it("paid_in_full when the balance reaches zero", () => {
    const pace = planPaymentPace(90000, milestones, [{ amount: 90000, status: "approved" }], TODAY);
    expect(pace.status).toBe("paid_in_full");
    expect(pace.nextDue).toBeNull();
  });

  it("no milestones = a single implicit clear-by never flags anyone", () => {
    const pace = planPaymentPace(90000, [], [{ amount: 10, status: "approved" }], TODAY);
    expect(pace.status).toBe("on_track");
    expect(pace.behindAmount).toBe(0);
  });

  it("price_pending while no agreed price is recorded: no balance, never behind", () => {
    const payments = [{ amount: 20000, status: "approved" }];
    const pace = planPaymentPace(null, [], payments, TODAY);
    expect(pace).toMatchObject({ status: "price_pending", balance: null, paidTotal: 20000, behindAmount: 0 });
    expect(planBalance(null, payments)).toBeNull();
  });

  it("schedule validation", () => {
    expect(validateMilestoneSchedule(90000, [])).toBe("EMPTY");
    expect(validateMilestoneSchedule(90000, [{ amount: 0, dueDate: TODAY }])).toBe("BAD_AMOUNT");
    expect(validateMilestoneSchedule(90000, [{ amount: 89999, dueDate: TODAY }])).toBe("SUM_MISMATCH");
    expect(validateMilestoneSchedule(90000, [{ amount: 90000, dueDate: TODAY }])).toBeNull();
  });
});

describe("server — updateMilestoneSchedule", () => {
  async function scene() {
    await seedUser({ id: "ops1", role: "ops_head" });
    const c = await seedClient({ id: "c1" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    await seedMilestone(cp.id, 1, { amount: 30000, dueDate: d("2026-10-01") });
    await seedMilestone(cp.id, 2, { amount: 60000, dueDate: d("2026-11-01") });
    return { c, cp };
  }

  it("replaces the schedule atomically and audit-logs the before/after", async () => {
    const { c, cp } = await scene();
    await updateMilestoneSchedule({
      clientId: c.id,
      actorId: "ops1",
      milestones: [
        { amount: 10000, dueDate: d("2026-12-01") },
        { amount: 80000, dueDate: d("2026-10-15") },
      ],
    });
    const rows = await prisma.paymentMilestone.findMany({
      where: { clientPlanId: cp.id },
      orderBy: { milestoneNumber: "asc" },
    });
    // Renumbered in due-date order.
    expect(rows.map((r) => r.amount)).toEqual([80000, 10000]);
    const log = await prisma.activityLog.findFirst({
      where: { entityType: "client", entityId: c.id, summary: "Payment schedule updated" },
    });
    expect(log).not.toBeNull();
  });

  it("records an agreed price for an unpriced plan together with its schedule", async () => {
    await seedUser({ id: "ops1", role: "ops_head" });
    const c = await seedClient({ id: "c2" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id, { agreedPrice: null });
    await expect(
      updateMilestoneSchedule({
        clientId: c.id,
        actorId: "ops1",
        milestones: [{ amount: 1000, dueDate: d("2026-12-01") }],
      }),
    ).rejects.toThrow("NO_PRICE");
    await updateMilestoneSchedule({
      clientId: c.id,
      actorId: "ops1",
      agreedPrice: 120000,
      milestones: [
        { amount: 40000, dueDate: d("2026-10-01") },
        { amount: 80000, dueDate: d("2026-11-01") },
      ],
    });
    const row = await prisma.clientPlan.findUniqueOrThrow({
      where: { id: cp.id },
      include: { milestones: true },
    });
    expect(row.agreedPrice).toBe(120000);
    expect(row.milestones).toHaveLength(2);
    const log = await prisma.activityLog.findFirst({
      where: { entityType: "client", entityId: c.id, summary: "Agreed price recorded" },
    });
    expect(log).not.toBeNull();
  });

  it("won't set the agreed price below what's already been settled", async () => {
    const { c, cp } = await scene();
    await prisma.payment.create({ data: { clientPlanId: cp.id, amount: 50000, status: "approved" } });
    await expect(
      updateMilestoneSchedule({
        clientId: c.id,
        actorId: "ops1",
        agreedPrice: 40000,
        milestones: [{ amount: 40000, dueDate: d("2026-12-01") }],
      }),
    ).rejects.toThrow("PRICE_BELOW_PAID");
  });

  it("rejects a schedule that doesn't sum to the agreed price, leaving the old one intact", async () => {
    const { c, cp } = await scene();
    await expect(
      updateMilestoneSchedule({
        clientId: c.id,
        actorId: "ops1",
        milestones: [{ amount: 1, dueDate: d("2026-12-01") }],
      }),
    ).rejects.toThrow("SUM_MISMATCH");
    const rows = await prisma.paymentMilestone.findMany({ where: { clientPlanId: cp.id } });
    expect(rows).toHaveLength(2);
  });
});

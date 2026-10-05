import { describe, expect, it } from "vitest";
import { prisma, getEnhancedPrisma } from "../src/index.js";
import {
  parseSalesReportInput,
  salesReportGrid,
  salesReportStatus,
  saveSalesReport,
  SalesReportError,
} from "../src/server/index.js";
import { seedUser, seedClient, seedPlan, seedClientPlan, seedPayment } from "./helpers.js";

/**
 * CRO daily sales reports (SALES_REPORTS_DESIGN.md): lead-creator stamping,
 * sales credit (§6), status rules (§5) and the write window (§3). Work days
 * use the 4 am IST boundary: 2026-10-01 runs 2026-09-30T22:30Z to
 * 2026-10-01T22:30Z.
 */

const DAY = "2026-10-01";
const NOON = new Date("2026-10-01T06:30:00.000Z"); // 12:00 pm IST on DAY
const NOW = new Date("2026-10-01T14:00:00.000Z"); // 7:30 pm IST on DAY

async function cro(id: string, role: "cro" | "ops_head" | "founder" = "cro") {
  await seedUser({ id, role });
  // Accounts exist well before the test days, so they are expected to report.
  await prisma.user.update({ where: { id }, data: { createdAt: new Date("2026-09-01T00:00:00.000Z") } });
}

async function assign(clientId: string, staffId: string, assignedAt: Date, unassignedAt?: Date) {
  return prisma.assignment.create({
    data: { clientId, staffId, role: "cro", assignedAt, unassignedAt, isActive: !unassignedAt },
  });
}

const counts = { enquiries: 10, leadFollowUps: 6, hotLeads: 2, plannedFollowUps: 5 };

function rowOf(grid: Awaited<ReturnType<typeof salesReportGrid>>, croId: string) {
  const row = grid.rows.find((r) => r.cro.id === croId);
  if (!row) throw new Error(`no row for ${croId}`);
  return row;
}

describe("Sales reports: lead creator", () => {
  it("a gateway lead create must stamp the caller as creator, and it can never change", async () => {
    await cro("croA");
    await cro("croB");
    const db = getEnhancedPrisma({ id: "croA", role: "cro" });
    const base = {
      name: "Lead",
      phone: "9000000001",
      email: "lead@test.local",
      type: "groom" as const,
      weddingDate: new Date("2027-01-10T00:00:00.000Z"),
      city: "Kochi",
    };

    const ok = await db.client.create({ data: { ...base, clientCode: "GTB1001", createdById: "croA" } });
    expect((await prisma.client.findUnique({ where: { id: ok.id } }))?.createdById).toBe("croA");

    // Crediting someone else, or leaving it blank, is refused.
    await expect(
      db.client.create({ data: { ...base, clientCode: "GTB1002", email: "b@test.local", createdById: "croB" } }),
    ).rejects.toThrow();
    await expect(
      db.client.create({ data: { ...base, clientCode: "GTB1003", email: "c@test.local" } }),
    ).rejects.toThrow();

    // Ops head (who may update clients) cannot move the credit afterwards.
    await cro("ops", "ops_head");
    await expect(
      getEnhancedPrisma({ id: "ops", role: "ops_head" }).client.update({
        where: { id: ok.id },
        data: { createdById: "croB" },
      }),
    ).rejects.toThrow();
    expect((await prisma.client.findUnique({ where: { id: ok.id } }))?.createdById).toBe("croA");
  });
});

describe("Sales reports: sales credit", () => {
  it("credits the CRO who created the lead, not the inviter or the approver", async () => {
    await cro("croA");
    await cro("croB");
    await cro("ops", "ops_head");
    const plan = await seedPlan();
    await seedClient({
      id: "c1",
      createdBy: { connect: { id: "croA" } },
      createdAt: NOON,
      conversionDate: NOON,
      convertedBy: { connect: { id: "ops" } },
      status: "converted",
    });
    // croB sent the invite, so holds the CRO assignment.
    await assign("c1", "croB", new Date("2026-09-30T00:00:00.000Z"));
    const cp = await seedClientPlan("c1", plan.id, { agreedPrice: 90000 });
    await seedPayment(cp.id, { status: "approved", amount: 30000, approvedAt: NOON });

    const grid = await salesReportGrid({ from: DAY, to: DAY, now: NOW });
    const a = rowOf(grid, "croA").days[0]!.figures;
    expect(a).toMatchObject({ leadsAdded: 1, sales: 1, salesValue: 90000, payments: 1, paymentsReceived: 30000 });
    expect(rowOf(grid, "croB").days[0]!.figures).toMatchObject({ sales: 0, paymentsReceived: 0 });
    // Ops head is not a CRO and gets no row.
    expect(grid.rows.some((r) => r.cro.id === "ops")).toBe(false);
  });

  it("falls back to the CRO assigned at the time for scan leads and founder-created leads", async () => {
    await cro("croA");
    await cro("croB");
    await cro("f1", "founder");
    const plan = await seedPlan();
    // Scan lead (no creator): croA held it until 10 am IST, then croB.
    await seedClient({ id: "scan", status: "converted", conversionDate: NOON });
    await assign("scan", "croA", new Date("2026-09-20T00:00:00.000Z"), new Date("2026-10-01T04:30:00.000Z"));
    await assign("scan", "croB", new Date("2026-10-01T04:30:00.000Z"));
    const scanPlan = await seedClientPlan("scan", plan.id, { agreedPrice: null });
    // Paid at 9 am IST, while croA still held it.
    await seedPayment(scanPlan.id, {
      status: "approved",
      amount: 5000,
      approvedAt: new Date("2026-10-01T03:30:00.000Z"),
    });

    // Founder created this lead; croA is its CRO.
    await seedClient({
      id: "fl",
      createdBy: { connect: { id: "f1" } },
      createdAt: NOON,
      status: "converted",
      conversionDate: NOON,
    });
    await assign("fl", "croA", new Date("2026-09-25T00:00:00.000Z"));
    await seedClientPlan("fl", plan.id, { agreedPrice: 40000 });

    // No creator, no CRO: credited to nobody.
    await seedClient({ id: "orphan", status: "converted", conversionDate: NOON });

    const grid = await salesReportGrid({ from: DAY, to: DAY, now: NOW });
    expect(rowOf(grid, "croA").days[0]!.figures).toMatchObject({
      sales: 1, // founder's lead
      salesValue: 40000,
      paymentsReceived: 5000, // scan payment, before the handover
      leadsAdded: 0, // the founder added it, not croA
    });
    expect(rowOf(grid, "croB").days[0]!.figures).toMatchObject({
      sales: 1, // scan conversion at noon, after the handover
      pricePending: 1,
      salesValue: 0,
    });
    expect(grid.unassigned[DAY]).toMatchObject({ sales: 1 });
  });

  it("counts only approved real payments: no waivers, pending, rejected or voided", async () => {
    await cro("croA");
    const plan = await seedPlan();
    await seedClient({ id: "c1", createdBy: { connect: { id: "croA" } } });
    const cp = await seedClientPlan("c1", plan.id);
    await seedPayment(cp.id, { status: "approved", amount: 1000, approvedAt: NOON });
    await seedPayment(cp.id, { status: "approved", amount: 2000, approvedAt: NOON, kind: "waiver" });
    await seedPayment(cp.id, { status: "pending_review", amount: 4000 });
    await seedPayment(cp.id, { status: "rejected", amount: 8000 });
    const voided = await seedPayment(cp.id, { status: "approved", amount: 16000, approvedAt: NOON });
    await prisma.payment.update({ where: { id: voided.id }, data: { status: "voided" } });

    const grid = await salesReportGrid({ from: DAY, to: DAY, now: NOW });
    expect(rowOf(grid, "croA").days[0]!.figures).toMatchObject({ payments: 1, paymentsReceived: 1000 });
  });

  it("buckets events by IST work day (4 am boundary)", async () => {
    await cro("croA");
    // 3:59 am IST on Oct 2 still counts toward Oct 1; 4:00 am starts Oct 2.
    await seedClient({ id: "late", createdBy: { connect: { id: "croA" } }, createdAt: new Date("2026-10-01T22:29:00.000Z") });
    await seedClient({ id: "next", createdBy: { connect: { id: "croA" } }, createdAt: new Date("2026-10-01T22:30:00.000Z") });
    const grid = await salesReportGrid({ from: DAY, to: "2026-10-02", now: NOW });
    const days = rowOf(grid, "croA").days;
    expect(days.map((d) => [d.day, d.figures.leadsAdded])).toEqual([
      ["2026-10-02", 1],
      [DAY, 1],
    ]);
  });
});

describe("Sales reports: status", () => {
  it("derives submitted, late, day off, pending and missed", () => {
    const today = "2026-10-05";
    const acct = "2026-09-01";
    const end = (d: string) => new Date(new Date(`${d}T22:30:00.000Z`).getTime());
    expect(salesReportStatus({ dayOff: false, submittedAt: new Date("2026-10-04T22:29:00.000Z") }, "2026-10-04", today, acct)).toBe("submitted");
    expect(salesReportStatus({ dayOff: false, submittedAt: end("2026-10-04") }, "2026-10-04", today, acct)).toBe("late");
    expect(salesReportStatus({ dayOff: true, submittedAt: end("2026-10-04") }, "2026-10-04", today, acct)).toBe("day_off");
    expect(salesReportStatus(null, today, today, acct)).toBe("pending");
    expect(salesReportStatus(null, "2026-10-03", today, acct)).toBe("missed");
    // Not expected before the account existed, or in the future.
    expect(salesReportStatus(null, "2026-10-03", today, "2026-10-04")).toBeNull();
    expect(salesReportStatus(null, "2026-10-06", today, acct)).toBeNull();
  });

  it("shows planned-yesterday next to today, and keeps deactivated CROs who filed", async () => {
    await cro("croA");
    await cro("gone");
    await saveSalesReport({ croId: "croA", day: "2026-09-30", input: { ...counts, plannedFollowUps: 7 }, now: new Date("2026-09-30T12:00:00.000Z") });
    await saveSalesReport({ croId: "gone", day: DAY, input: counts, now: NOON });
    await prisma.user.update({ where: { id: "gone" }, data: { isActive: false } });
    await cro("quiet");
    await prisma.user.update({ where: { id: "quiet" }, data: { isActive: false } });

    const grid = await salesReportGrid({ from: DAY, to: DAY, now: NOW });
    const a = rowOf(grid, "croA").days[0]!;
    expect(a.status).toBe("pending");
    expect(a.plannedYesterday).toBe(7);
    expect(rowOf(grid, "gone").days[0]!.status).toBe("submitted");
    // Deactivated with nothing filed: not listed at all.
    expect(grid.rows.some((r) => r.cro.id === "quiet")).toBe(false);
  });
});

describe("Sales reports: writing", () => {
  it("creates and edits today's report until the deadline", async () => {
    await cro("croA");
    const first = await saveSalesReport({ croId: "croA", day: DAY, input: counts, now: NOON });
    expect(first.editedAt).toBeNull();
    const edited = await saveSalesReport({
      croId: "croA",
      day: DAY,
      input: { ...counts, enquiries: 12, challenges: "Need more leads" },
      now: NOW,
    });
    expect(edited.id).toBe(first.id);
    expect(edited.enquiries).toBe(12);
    expect(edited.submittedAt).toEqual(first.submittedAt);
    expect(edited.editedAt).toEqual(NOW);

    // After 4 am IST the day is closed for edits.
    const nextMorning = new Date("2026-10-01T23:00:00.000Z");
    await expect(saveSalesReport({ croId: "croA", day: DAY, input: counts, now: nextMorning })).rejects.toBeInstanceOf(
      SalesReportError,
    );
  });

  it("files yesterday late once, never older days", async () => {
    await cro("croA");
    const nextDay = new Date("2026-10-02T06:00:00.000Z");
    const late = await saveSalesReport({ croId: "croA", day: DAY, input: counts, now: nextDay });
    const grid = await salesReportGrid({ from: DAY, to: DAY, now: nextDay });
    expect(rowOf(grid, "croA").days[0]!.status).toBe("late");
    expect(late.submittedAt).toEqual(nextDay);

    await expect(saveSalesReport({ croId: "croA", day: DAY, input: counts, now: nextDay })).rejects.toThrow(/already in/);
    await expect(
      saveSalesReport({ croId: "croA", day: "2026-09-29", input: counts, now: nextDay }),
    ).rejects.toThrow(/only be filed/);
  });

  it("a day off clears the counts", async () => {
    await cro("croA");
    await saveSalesReport({ croId: "croA", day: DAY, input: counts, now: NOON });
    const off = await saveSalesReport({ croId: "croA", day: DAY, input: { dayOff: true }, now: NOW });
    expect(off).toMatchObject({ dayOff: true, enquiries: null, plannedFollowUps: null, challenges: null });
  });

  it("validates input", () => {
    expect(() => parseSalesReportInput({ ...counts, enquiries: -1 })).toThrow(/New enquiries/);
    expect(() => parseSalesReportInput({ ...counts, hotLeads: 1.5 })).toThrow(/Hot leads/);
    expect(() => parseSalesReportInput({ ...counts, plannedFollowUps: 1000 })).toThrow(/999/);
    expect(() => parseSalesReportInput({ enquiries: 1 })).toThrow();
    expect(() => parseSalesReportInput({ ...counts, challenges: "x".repeat(2001) })).toThrow(/2000/);
    expect(parseSalesReportInput({ ...counts, challenges: "  " })).toMatchObject({ challenges: null });
    expect(parseSalesReportInput({ dayOff: true, enquiries: 5 })).toEqual({ dayOff: true });
  });

  it("the gateway cannot read or write reports", async () => {
    await cro("croA");
    await cro("f1", "founder");
    await saveSalesReport({ croId: "croA", day: DAY, input: counts, now: NOON });
    for (const user of [{ id: "croA", role: "cro" as const }, { id: "f1", role: "founder" as const }]) {
      const db = getEnhancedPrisma(user);
      expect(await db.salesReport.findMany()).toEqual([]);
      await expect(
        db.salesReport.create({ data: { croId: user.id, day: new Date(`${DAY}T00:00:00Z`), submittedAt: NOW } }),
      ).rejects.toThrow();
    }
  });
});

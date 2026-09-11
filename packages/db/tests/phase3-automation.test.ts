import { describe, expect, it } from "vitest";
import { istAddDays, istStartOfDay } from "@gtb/shared";
import { prisma } from "../src/index.js";
import { runDailyJobs, cancelClientPlan, rescheduleSession } from "../src/server/index.js";
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
  seedFollowUp,
} from "./helpers.js";

function daysFromNow(n: number, at = new Date()): Date {
  const d = new Date(at);
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

describe("Phase 3 — SYS-2: daily jobs", () => {
  it("flips past-due pending follow-ups to overdue (milestones are derived, never flipped)", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    const oldFup = await seedFollowUp({ clientId: c.id, croId: "cro1" });
    await prisma.followUp.update({ where: { id: oldFup.id }, data: { dueDate: daysFromNow(-1) } });

    const report = await runDailyJobs();
    expect(report.followUpsMarkedOverdue).toBe(1);
    const fupRow = await prisma.followUp.findUniqueOrThrow({ where: { id: oldFup.id } });
    expect(fupRow.status).toBe("overdue");
  });

  it("creates a session reminder for tomorrow's session and is idempotent per day", async () => {
    await seedUser({ id: "client1", role: "client" });
    const c = await seedClient({ id: "c1", userId: "client1" });
    // Anchor to the IST calendar (the cron's day math) — a local-TZ "tomorrow
    // noon" can still be IST-today when the host clock is west of IST.
    const istTomorrowNoon = new Date(istAddDays(istStartOfDay(new Date()), 1).getTime() + 12 * 60 * 60 * 1000);
    await prisma.session.create({
      data: {
        clientId: c.id,
        serviceType: "skincare",
        sessionNumber: 1,
        scheduledDate: istTomorrowNoon,
        status: "scheduled",
      },
    });
    const r1 = await runDailyJobs();
    const r2 = await runDailyJobs(); // double-fire must not duplicate
    expect(r1.sessionRemindersSent).toBe(1);
    expect(r2.sessionRemindersSent).toBe(0);
    const notifs = await prisma.notification.count({ where: { type: "session_reminder" } });
    expect(notifs).toBe(1);
  });

  it("creates a payment-reminder follow-up for milestones due in ~3 days when behind pace", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1", status: "active" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    await seedMilestone(cp.id, 1, { dueDate: daysFromNow(3), amount: 30000 });

    await runDailyJobs();
    const reminder = await prisma.followUp.findFirst({
      where: { clientId: c.id, type: "payment_reminder" },
    });
    expect(reminder).not.toBeNull();
    // and the guard prevents duplicates on a second run
    await runDailyJobs();
    const count = await prisma.followUp.count({
      where: { clientId: c.id, type: "payment_reminder" },
    });
    expect(count).toBe(1);
  });

  it("skips the reminder when cumulative payments already cover the milestone", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1", status: "active" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    await seedMilestone(cp.id, 1, { dueDate: daysFromNow(3), amount: 30000 });
    // Paid ahead in one odd-sized chunk — no nag even though a milestone is near.
    await seedPayment(cp.id, { status: "approved", amount: 35000 });

    const report = await runDailyJobs();
    expect(report.paymentReminderFollowUpsCreated).toBe(0);
    const count = await prisma.followUp.count({
      where: { clientId: c.id, type: "payment_reminder" },
    });
    expect(count).toBe(0);
  });

  it("creates a satisfaction-check follow-up after every 3rd completed session", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1", status: "active" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    for (let n = 1; n <= 3; n++) {
      await prisma.session.create({
        data: {
          clientId: c.id,
          serviceType: "fitness",
          sessionNumber: n,
          scheduledDate: daysFromNow(-5),
          status: "completed",
        },
      });
    }
    const report = await runDailyJobs();
    expect(report.satisfactionCheckFollowUpsCreated).toBe(1);
    await runDailyJobs(); // still pending → no duplicate
    const count = await prisma.followUp.count({
      where: { clientId: c.id, type: "satisfaction_check" },
    });
    expect(count).toBe(1);
  });
});

describe("Phase 3 — SYS-3: cancellation cascade", () => {
  async function seedCancelScene() {
    await seedUser({ id: "client1", role: "client" });
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1", userId: "client1", status: "active" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    const paid = await seedPayment(cp.id, { status: "approved", amount: 30000 });
    const underReview = await seedPayment(cp.id, { status: "pending_review", amount: 10000 });
    const future = await seedSession({ clientId: c.id, status: "scheduled", sessionNumber: 1 });
    const past = await seedSession({ clientId: c.id, status: "completed", sessionNumber: 2 });
    return { c, cp, paid, underReview, future, past };
  }

  it("cancels future sessions, waives the outstanding balance, blocks login, logs activity", async () => {
    const { c, cp, paid, underReview, future, past } = await seedCancelScene();
    const res = await cancelClientPlan({ clientId: c.id, reason: "Wedding postponed", actorId: "cro1" });
    const client = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(client.status).toBe("cancelled");
    expect(client.cancellationReason).toBe("Wedding postponed");
    const s1 = await prisma.session.findUniqueOrThrow({ where: { id: future.id } });
    expect(s1.status).toBe("cancelled");
    const s2 = await prisma.session.findUniqueOrThrow({ where: { id: past.id } });
    expect(s2.status).toBe("completed"); // history untouched
    const p1 = await prisma.payment.findUniqueOrThrow({ where: { id: paid.id } });
    expect(p1.status).toBe("approved"); // real money untouched
    const p2 = await prisma.payment.findUniqueOrThrow({ where: { id: underReview.id } });
    expect(p2.status).toBe("rejected"); // review queue closed
    // 90k price − 30k approved = 60k written off as a waiver entry.
    expect(res.amountWaived).toBe(60000);
    const waiver = await prisma.payment.findFirstOrThrow({
      where: { clientPlanId: cp.id, kind: "waiver" },
    });
    expect(waiver.amount).toBe(60000);
    expect(waiver.status).toBe("approved");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: "client1" } });
    expect(user.isActive).toBe(false);
    const logs = await prisma.activityLog.count({ where: { entityId: c.id } });
    expect(logs).toBeGreaterThanOrEqual(3);
  });
});

describe("Phase 3 — DATA-2: reschedule history", () => {
  // Relative dates: hardcoded calendar dates rot into the PAST_DATE guard.
  const original = daysFromNow(30);

  it("preserves the original scheduled date on first reschedule", async () => {
    await seedUser({ id: "consultant1", role: "skincare_consultant" });
    const c = await seedClient({ id: "c1" });
    const s = await seedSession({ clientId: c.id, consultantId: "consultant1", scheduledDate: original });
    const later = daysFromNow(45);
    await rescheduleSession({ sessionId: s.id, newDate: later, actorId: "consultant1" });
    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.originalScheduledDate).toEqual(original);
    expect(row.status).toBe("delayed");
    expect(row.scheduledDate).toEqual(later);
    const logs = await prisma.activityLog.count({ where: { entityType: "session", entityId: s.id } });
    expect(logs).toBe(1);
  });

  it("does not brand the session delayed when moved earlier (MISC-3)", async () => {
    await seedUser({ id: "consultant1", role: "skincare_consultant" });
    const c = await seedClient({ id: "c1" });
    const s = await seedSession({ clientId: c.id, consultantId: "consultant1", scheduledDate: original });
    await rescheduleSession({ sessionId: s.id, newDate: daysFromNow(10), actorId: "consultant1" });
    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("scheduled");
    expect(row.originalScheduledDate).toEqual(original);
  });
});

describe("Phase 3 — SYS-1: activity log writers", () => {
  it("approval writes audit rows for the payment and the conversion", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    const p = await seedPayment(cp.id, { status: "pending_review", amount: 30000 });
    const { approvePayment } = await import("../src/server/index.js");
    await approvePayment({ paymentId: p.id, paymentMethod: "upi", actorId: "cro1" });
    const paymentLogs = await prisma.activityLog.findMany({
      where: { entityType: "payment", entityId: p.id },
    });
    expect(paymentLogs).toHaveLength(1);
    expect(paymentLogs[0].action).toBe("status_changed");
    const clientLogs = await prisma.activityLog.findMany({
      where: { entityType: "client", entityId: c.id },
    });
    expect(clientLogs.some((l) => l.summary?.includes("converted"))).toBe(true);
  });
});

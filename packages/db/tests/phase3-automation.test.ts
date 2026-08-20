import { describe, expect, it } from "vitest";
import { prisma } from "../src/index.js";
import { runDailyJobs, cancelClientPlan, rescheduleSession } from "../src/server/index.js";
import {
  seedUser,
  seedClient,
  seedPlan,
  seedClientPlan,
  seedInstallment,
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
  it("flips past-due pending installments and follow-ups to overdue", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    const pastDue = await seedInstallment(cp.id, 1);
    await prisma.installment.update({ where: { id: pastDue.id }, data: { dueDate: daysFromNow(-2) } });
    const future = await seedInstallment(cp.id, 2);
    await prisma.installment.update({ where: { id: future.id }, data: { dueDate: daysFromNow(10) } });
    const oldFup = await seedFollowUp({ clientId: c.id, croId: "cro1" });
    await prisma.followUp.update({ where: { id: oldFup.id }, data: { dueDate: daysFromNow(-1) } });

    const report = await runDailyJobs();
    expect(report.installmentsMarkedOverdue).toBe(1);
    expect(report.followUpsMarkedOverdue).toBe(1);
    const overdue = await prisma.installment.count({ where: { clientPlanId: cp.id, status: "overdue" } });
    expect(overdue).toBe(1);
    const futureRow = await prisma.installment.findUniqueOrThrow({ where: { id: future.id } });
    expect(futureRow.status).toBe("pending");
    const fupRow = await prisma.followUp.findUniqueOrThrow({ where: { id: oldFup.id } });
    expect(fupRow.status).toBe("overdue");
  });

  it("creates a session reminder for tomorrow's session and is idempotent per day", async () => {
    await seedUser({ id: "client1", role: "client" });
    const c = await seedClient({ id: "c1", userId: "client1" });
    await prisma.session.create({
      data: {
        clientId: c.id,
        serviceType: "skincare",
        sessionNumber: 1,
        scheduledDate: daysFromNow(1),
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

  it("creates a payment-reminder follow-up for installments due in ~3 days", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1", status: "active" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    const inst = await seedInstallment(cp.id, 1);
    await prisma.installment.update({ where: { id: inst.id }, data: { dueDate: daysFromNow(3) } });

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
    const paid = await seedInstallment(cp.id, 1, "approved");
    const pending = await seedInstallment(cp.id, 2);
    const future = await seedSession({ clientId: c.id, status: "scheduled", sessionNumber: 1 });
    const past = await seedSession({ clientId: c.id, status: "completed", sessionNumber: 2 });
    return { c, paid, pending, future, past };
  }

  it("cancels future sessions, waives outstanding installments, blocks login, logs activity", async () => {
    const { c, paid, pending, future, past } = await seedCancelScene();
    await cancelClientPlan({ clientId: c.id, reason: "Wedding postponed", actorId: "cro1" });
    const client = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(client.status).toBe("cancelled");
    expect(client.cancellationReason).toBe("Wedding postponed");
    const s1 = await prisma.session.findUniqueOrThrow({ where: { id: future.id } });
    expect(s1.status).toBe("cancelled");
    const s2 = await prisma.session.findUniqueOrThrow({ where: { id: past.id } });
    expect(s2.status).toBe("completed"); // history untouched
    const p1 = await prisma.installment.findUniqueOrThrow({ where: { id: paid.id } });
    expect(p1.status).toBe("approved"); // real money untouched
    const p2 = await prisma.installment.findUniqueOrThrow({ where: { id: pending.id } });
    expect(p2.status).toBe("waived");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: "client1" } });
    expect(user.isActive).toBe(false);
    const logs = await prisma.activityLog.count({ where: { entityId: c.id } });
    expect(logs).toBeGreaterThanOrEqual(3);
  });
});

describe("Phase 3 — DATA-2: reschedule history", () => {
  it("preserves the original scheduled date on first reschedule", async () => {
    await seedUser({ id: "consultant1", role: "skincare_consultant" });
    const c = await seedClient({ id: "c1" });
    const s = await seedSession({ clientId: c.id, consultantId: "consultant1" });
    await rescheduleSession({ sessionId: s.id, newDate: new Date("2026-10-01T00:00:00.000Z"), actorId: "consultant1" });
    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.originalScheduledDate).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    expect(row.status).toBe("delayed");
    expect(row.scheduledDate).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    const logs = await prisma.activityLog.count({ where: { entityType: "session", entityId: s.id } });
    expect(logs).toBe(1);
  });

  it("does not brand the session delayed when moved earlier (MISC-3)", async () => {
    await seedUser({ id: "consultant1", role: "skincare_consultant" });
    const c = await seedClient({ id: "c1" });
    const s = await seedSession({ clientId: c.id, consultantId: "consultant1" });
    await rescheduleSession({ sessionId: s.id, newDate: new Date("2026-08-15T00:00:00.000Z"), actorId: "consultant1" });
    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("scheduled");
    expect(row.originalScheduledDate).toEqual(new Date("2026-09-01T00:00:00.000Z"));
  });
});

describe("Phase 3 — SYS-1: activity log writers", () => {
  it("approval writes audit rows for the installment and the conversion", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    const inst = await seedInstallment(cp.id, 1);
    const { approveInstallment } = await import("../src/server/index.js");
    await approveInstallment({ installmentId: inst.id, paymentMethod: "upi", actorId: "cro1" });
    const installmentLogs = await prisma.activityLog.findMany({
      where: { entityType: "installment", entityId: inst.id },
    });
    expect(installmentLogs).toHaveLength(1);
    expect(installmentLogs[0].action).toBe("status_changed");
    const clientLogs = await prisma.activityLog.findMany({
      where: { entityType: "client", entityId: c.id },
    });
    expect(clientLogs.some((l) => l.summary?.includes("converted"))).toBe(true);
  });
});

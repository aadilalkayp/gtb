import { describe, expect, it } from "vitest";
import { prisma, getEnhancedPrisma } from "../src/index.js";
import { cancelSession } from "../src/server/sessionCancellation.js";
import { cancelClientPlan } from "../src/server/clientCancellation.js";
import { rescheduleSession } from "../src/server/sessionReschedule.js";
import { submitPaymentProof, ProofConflictError } from "../src/server/proofSubmission.js";
import { activateClientPlan } from "../src/server/clientActivation.js";
import { runDailyJobs } from "../src/server/cronJobs.js";
import {
  seedUser,
  seedClient,
  seedPlan,
  seedClientPlan,
  seedInstallment,
  seedAssignment,
  seedSession,
  seedDocument,
  seedFollowUp,
} from "./helpers.js";

function as(id: string, role: Parameters<typeof seedUser>[0]["role"]) {
  return getEnhancedPrisma({ id, role });
}

async function expectDenied(p: Promise<unknown>) {
  await expect(p).rejects.toThrow(/denied by policy|ACCESS_POLICY_VIOLATION|P2004/i);
}

// ---------------------------------------------------------------------------
// Gateway policy gaps found in the 2026-08-14 verification pass
// ---------------------------------------------------------------------------

describe("Verification — Installment write scoping (V-1/V-5)", () => {
  async function scene() {
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "cro2", role: "cro" });
    const c = await seedClient({ id: "c1" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    return { c, cp };
  }

  it("denies a CRO updating an installment of a client they are not assigned to", async () => {
    const { cp } = await scene();
    const inst = await seedInstallment(cp.id, 1);
    await expectDenied(
      as("cro2", "cro").installment.update({
        where: { id: inst.id },
        data: { status: "approved", approvedById: "cro2", approvedAt: new Date() },
      }),
    );
    const row = await prisma.installment.findUniqueOrThrow({ where: { id: inst.id } });
    expect(row.status).toBe("pending");
  });

  it("allows the assigned CRO to update, but not to attribute the approval to someone else", async () => {
    const { cp } = await scene();
    const inst = await seedInstallment(cp.id, 1);
    await expectDenied(
      as("cro1", "cro").installment.update({
        where: { id: inst.id },
        data: { status: "approved", approvedById: "cro2", approvedAt: new Date() },
      }),
    );
    await as("cro1", "cro").installment.update({
      where: { id: inst.id },
      data: { status: "approved", approvedById: "cro1", approvedAt: new Date() },
    });
    const row = await prisma.installment.findUniqueOrThrow({ where: { id: inst.id } });
    expect(row.approvedById).toBe("cro1");
  });

  it("denies a CRO creating installments on an unassigned client's plan", async () => {
    const { cp } = await scene();
    await expectDenied(
      as("cro2", "cro").installment.create({
        data: {
          clientPlanId: cp.id,
          installmentNumber: 9,
          amount: 1,
          dueDate: new Date(),
        },
      }),
    );
  });
});

describe("Verification — ClientPlan writes are admin-only (V-4)", () => {
  it("denies a CRO rewriting priceAtEnrollment / servicesSnapshot", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    await expectDenied(
      as("cro1", "cro").clientPlan.update({
        where: { id: cp.id },
        data: { priceAtEnrollment: 1 },
      }),
    );
    const row = await prisma.clientPlan.findUniqueOrThrow({ where: { id: cp.id } });
    expect(row.priceAtEnrollment).toBe(90000);
  });
});

describe("Verification — Notification integrity (V-7)", () => {
  async function seedNotification(userId: string) {
    return prisma.notification.create({
      data: { userId, type: "test", title: "Test", body: "b", linkPath: "/x" },
    });
  }

  it("denies re-pointing a notification at another user (phishing primitive)", async () => {
    await seedUser({ id: "attacker", role: "client" });
    await seedUser({ id: "victim", role: "client" });
    const n = await seedNotification("attacker");
    await expectDenied(
      as("attacker", "client").notification.update({
        where: { id: n.id },
        data: { userId: "victim", title: "Payment failed — re-enter details" },
      }),
    );
  });

  it("denies rewriting title/body/linkPath; still allows mark-as-read", async () => {
    await seedUser({ id: "u1", role: "client" });
    const n = await seedNotification("u1");
    const db = as("u1", "client");
    await expectDenied(db.notification.update({ where: { id: n.id }, data: { title: "x" } }));
    await expectDenied(db.notification.update({ where: { id: n.id }, data: { linkPath: "https://evil" } }));
    await db.notification.update({ where: { id: n.id }, data: { isRead: true } });
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(row.isRead).toBe(true);
    expect(row.title).toBe("Test");
  });
});

describe("Verification — Task creator/assignee integrity (V-9)", () => {
  it("denies non-admin creating a task attributed to someone else", async () => {
    await seedUser({ id: "coach1", role: "coach" });
    await seedUser({ id: "founder1", role: "founder" });
    await seedUser({ id: "victim", role: "cro" });
    await expectDenied(
      as("coach1", "coach").task.create({
        data: {
          title: "Fake founder task",
          assignedById: "founder1",
          assignedToId: "victim",
        },
      }),
    );
    await as("coach1", "coach").task.create({
      data: { title: "Legit", assignedById: "coach1", assignedToId: "victim" },
    });
  });

  it("denies an assignee reassigning the task or its creator; creator may reassign", async () => {
    await seedUser({ id: "creator", role: "cro" });
    await seedUser({ id: "assignee", role: "coach" });
    await seedUser({ id: "other", role: "media" });
    const t = await prisma.task.create({
      data: { title: "T", assignedById: "creator", assignedToId: "assignee" },
    });
    await expectDenied(
      as("assignee", "coach").task.update({ where: { id: t.id }, data: { assignedToId: "other" } }),
    );
    await expectDenied(
      as("assignee", "coach").task.update({ where: { id: t.id }, data: { assignedById: "assignee" } }),
    );
    await as("assignee", "coach").task.update({ where: { id: t.id }, data: { status: "in_progress" } });
    await as("creator", "cro").task.update({ where: { id: t.id }, data: { assignedToId: "other" } });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.assignedToId).toBe("other");
  });
});

describe("Verification — FollowUp / StylingOperation relink guards (V-10/V-11)", () => {
  it("denies a CRO moving their follow-up to another client or CRO", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "cro2", role: "cro" });
    const c1 = await seedClient({ id: "c1" });
    await seedClient({ id: "c2" });
    const f = await seedFollowUp({ clientId: c1.id, croId: "cro1" });
    const db = as("cro1", "cro");
    await expectDenied(db.followUp.update({ where: { id: f.id }, data: { clientId: "c2" } }));
    await expectDenied(db.followUp.update({ where: { id: f.id }, data: { croId: "cro2" } }));
    await db.followUp.update({ where: { id: f.id }, data: { status: "completed", completedDate: new Date() } });
  });

  it("denies the stylist relinking clientId/sessionId/stylistId; checklist still works", async () => {
    await seedUser({ id: "stylist1", role: "styling_consultant" });
    await seedUser({ id: "stylist2", role: "styling_consultant" });
    const c1 = await seedClient({ id: "c1" });
    await seedClient({ id: "c2" });
    const s = await seedSession({ clientId: c1.id, serviceType: "styling" });
    const op = await prisma.stylingOperation.create({
      data: { clientId: c1.id, stylistId: "stylist1" },
    });
    const db = as("stylist1", "styling_consultant");
    await expectDenied(db.stylingOperation.update({ where: { id: op.id }, data: { clientId: "c2" } }));
    await expectDenied(db.stylingOperation.update({ where: { id: op.id }, data: { sessionId: s.id } }));
    await expectDenied(db.stylingOperation.update({ where: { id: op.id }, data: { stylistId: "stylist2" } }));
    await db.stylingOperation.update({
      where: { id: op.id },
      data: { consultationDone: true, consultationDoneAt: new Date() },
    });
  });
});

describe("Verification — Client auth-link + wedding date immutability (V-8)", () => {
  it("denies relinking Client.userId through the gateway, even for admins", async () => {
    await seedUser({ id: "ops1", role: "ops_head" });
    await seedUser({ id: "client1", role: "client" });
    await seedUser({ id: "staff1", role: "cro" });
    const c = await seedClient({ id: "c1", userId: "client1" });
    await expectDenied(
      as("ops1", "ops_head").client.update({ where: { id: c.id }, data: { userId: "staff1" } }),
    );
  });

  it("denies gateway weddingDate writes (the server route recalculates the schedule)", async () => {
    await seedUser({ id: "ops1", role: "ops_head" });
    const c = await seedClient({ id: "c1" });
    await expectDenied(
      as("ops1", "ops_head").client.update({
        where: { id: c.id },
        data: { weddingDate: new Date("2027-01-01") },
      }),
    );
  });
});

describe("Verification — read scoping for clients (V-12/V-13)", () => {
  it("hides lead sources and inactive-plan services from clients", async () => {
    await seedUser({ id: "client1", role: "client" });
    await seedClient({ id: "c1", userId: "client1" });
    await prisma.leadSource.create({ data: { name: "Instagram Ads" } });
    const inactive = await prisma.plan.create({
      data: { name: "Internal", clientType: "bride", durationMonths: 1, price: 1, isActive: false },
    });
    await prisma.planService.create({
      data: { planId: inactive.id, serviceType: "styling", totalSessions: 1, startOffsetDays: 10 },
    });
    const db = as("client1", "client");
    expect(await db.leadSource.findMany()).toHaveLength(0);
    expect(await db.planService.findMany()).toHaveLength(0);
  });

  it("omits authId from staff rows read by a client", async () => {
    await seedUser({ id: "client1", role: "client" });
    await seedClient({ id: "c1", userId: "client1" });
    await prisma.user.create({
      data: { id: "staff1", email: "s@t.local", name: "S", role: "cro", authId: "supabase-uid" },
    });
    const rows = await as("client1", "client").user.findMany({ where: { id: "staff1" } });
    expect(rows).toHaveLength(1);
    expect((rows[0] as { authId?: string }).authId).toBeUndefined();
  });
});

describe("Verification — ContentItem delete is founder-only (V-14)", () => {
  it("denies a media user deleting content items", async () => {
    await seedUser({ id: "media1", role: "media" });
    const item = await prisma.contentItem.create({
      data: { title: "Reel", contentType: "reel", campaign: "gtb", platform: "instagram" },
    });
    await expectDenied(as("media1", "media").contentItem.delete({ where: { id: item.id } }));
    await as("media1", "media").contentItem.update({
      where: { id: item.id },
      data: { status: "shooting" },
    });
  });
});

// ---------------------------------------------------------------------------
// Server-side fixes
// ---------------------------------------------------------------------------

describe("Verification — sessions/cancel server path", () => {
  it("cancels with an audit row; refuses completed/cancelled sessions", async () => {
    await seedUser({ id: "ops1", role: "ops_head" });
    const c = await seedClient({ id: "c1" });
    const s = await seedSession({ clientId: c.id });
    await cancelSession({ sessionId: s.id, outcome: "cancelled", actorId: "ops1" });
    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("cancelled");
    const audit = await prisma.activityLog.findFirst({
      where: { entityType: "session", entityId: s.id, action: "status_changed" },
    });
    expect(audit?.performedById).toBe("ops1");
    await expect(
      cancelSession({ sessionId: s.id, outcome: "missed", actorId: "ops1" }),
    ).rejects.toThrow("LOCKED");
  });
});

describe("Verification — cancel/complete client race guards", () => {
  it("second concurrent cancel loses with ALREADY_CANCELLED", async () => {
    await seedUser({ id: "ops1", role: "ops_head" });
    const c = await seedClient({ id: "c1", status: "active" });
    const results = await Promise.allSettled([
      cancelClientPlan({ clientId: c.id, reason: "a", actorId: "ops1" }),
      cancelClientPlan({ clientId: c.id, reason: "b", actorId: "ops1" }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    const row = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.status).toBe("cancelled");
  });
});

describe("Verification — reschedule past-date guard (MISC-3)", () => {
  it("rejects a past newDate", async () => {
    await seedUser({ id: "ops1", role: "ops_head" });
    const c = await seedClient({ id: "c1" });
    const s = await seedSession({ clientId: c.id });
    await expect(
      rescheduleSession({ sessionId: s.id, newDate: new Date("1990-01-01"), actorId: "ops1" }),
    ).rejects.toThrow("PAST_DATE");
  });
});

describe("Verification — proof re-submission P2002 → conflict", () => {
  it("maps a proof document already linked elsewhere to ProofConflictError", async () => {
    await seedUser({ id: "client1", role: "client" });
    const c = await seedClient({ id: "c1", userId: "client1" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    const i1 = await seedInstallment(cp.id, 1);
    const i2 = await seedInstallment(cp.id, 2);
    const doc = await seedDocument({ clientId: c.id, type: "payment_proof", uploadedById: "client1" });
    await submitPaymentProof({ installmentId: i1.id, proofDocumentId: doc.id, actorId: "client1" });
    await expect(
      submitPaymentProof({ installmentId: i2.id, proofDocumentId: doc.id, actorId: "client1" }),
    ).rejects.toBeInstanceOf(ProofConflictError);
  });
});

describe("Verification — activation actor + seed guard (MISC-6)", () => {
  it("audit rows carry the actor, and a cron-made payment_reminder doesn't suppress seeding", async () => {
    await seedUser({ id: "ops1", role: "ops_head" });
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "skin1", role: "skincare_consultant" });
    const c = await seedClient({ id: "c1", status: "converted" });
    const plan = await seedPlan();
    await prisma.clientPlan.create({
      data: {
        clientId: c.id,
        planId: plan.id,
        planNameSnapshot: "Test Plan",
        priceAtEnrollment: 90000,
        durationMonths: 3,
        servicesSnapshot: [
          { serviceType: "skincare", totalSessions: 2, startOffsetDays: 60, frequencyDays: 14 },
        ],
      },
    });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    await seedAssignment({ clientId: c.id, staffId: "skin1", role: "skincare_consultant" });
    // A pre-existing cron-generated follow-up must not suppress the recurring seeds.
    await seedFollowUp({ clientId: c.id, croId: "cro1", type: "payment_reminder" });

    await activateClientPlan(c.id, "ops1");

    const audit = await prisma.activityLog.findFirst({
      where: { entityType: "client", entityId: c.id, action: "status_changed" },
    });
    expect(audit?.performedById).toBe("ops1");

    const seeded = await prisma.followUp.findMany({
      where: { clientId: c.id, type: { in: ["weekly_checkin", "progress_update"] } },
    });
    expect(seeded).toHaveLength(2);
  });
});

describe("Verification — cron idempotency & day-boundary fixes", () => {
  it("does not flip an installment overdue on its due date", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1", status: "active" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    await prisma.installment.create({
      data: {
        clientPlanId: cp.id,
        installmentNumber: 1,
        amount: 1000,
        dueDate: new Date(), // due today (IST) — not yet overdue
        status: "pending",
      },
    });
    await prisma.installment.create({
      data: {
        clientPlanId: cp.id,
        installmentNumber: 2,
        amount: 1000,
        dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // clearly past
        status: "pending",
      },
    });
    await runDailyJobs();
    const rows = await prisma.installment.findMany({
      where: { clientPlanId: cp.id },
      orderBy: { installmentNumber: "asc" },
    });
    expect(rows[0].status).toBe("pending");
    expect(rows[1].status).toBe("overdue");
  });

  it("does not regenerate a satisfaction check after the CRO completes it", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1", status: "active" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    for (let n = 1; n <= 3; n++) {
      await seedSession({ clientId: c.id, sessionNumber: n, status: "completed" });
    }
    await runDailyJobs();
    const first = await prisma.followUp.findFirst({
      where: { clientId: c.id, type: "satisfaction_check" },
    });
    expect(first).not.toBeNull();
    // CRO completes it the same afternoon…
    await prisma.followUp.update({
      where: { id: first!.id },
      data: { status: "completed", completedDate: new Date() },
    });
    // …and the next day's run must NOT create a second one for the same milestone.
    await runDailyJobs();
    const count = await prisma.followUp.count({
      where: { clientId: c.id, type: "satisfaction_check" },
    });
    expect(count).toBe(1);
  });

  it("payment reminders are one-per-installment-window even after completion", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const c = await seedClient({ id: "c1", status: "active" });
    await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(c.id, plan.id);
    await prisma.installment.create({
      data: {
        clientPlanId: cp.id,
        installmentNumber: 1,
        amount: 1000,
        dueDate: new Date(), // due today
        status: "pending",
      },
    });
    await runDailyJobs();
    const after1 = await prisma.followUp.count({
      where: { clientId: c.id, type: "payment_reminder" },
    });
    expect(after1).toBe(1);
    // Complete it, run again — no regeneration for the same window.
    const f = await prisma.followUp.findFirstOrThrow({
      where: { clientId: c.id, type: "payment_reminder" },
    });
    await prisma.followUp.update({
      where: { id: f.id },
      data: { status: "completed", completedDate: new Date() },
    });
    await runDailyJobs();
    const after2 = await prisma.followUp.count({
      where: { clientId: c.id, type: "payment_reminder" },
    });
    expect(after2).toBe(1);
  });

  it("session reminders don't collapse distinct sessions for the same consultant", async () => {
    await seedUser({ id: "cons1", role: "skincare_consultant" });
    const c1 = await seedClient({ id: "c1", status: "active" });
    const c2 = await seedClient({ id: "c2", status: "active" });
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.session.create({
      data: { clientId: c1.id, serviceType: "skincare", sessionNumber: 1, scheduledDate: tomorrow, consultantId: "cons1" },
    });
    await prisma.session.create({
      data: { clientId: c2.id, serviceType: "skincare", sessionNumber: 1, scheduledDate: tomorrow, consultantId: "cons1" },
    });
    await runDailyJobs();
    const reminders = await prisma.notification.count({
      where: { userId: "cons1", type: "session_reminder" },
    });
    expect(reminders).toBe(2);
  });
});

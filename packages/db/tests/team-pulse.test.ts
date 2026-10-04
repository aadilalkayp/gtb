import { beforeEach, describe, expect, it } from "vitest";
import { workDayKey } from "@gtb/shared";
import {
  prisma,
  getEnhancedPrisma,
  createAuditContext,
  runWithAuditContext,
  flushRequestAudit,
  type AuditContext,
} from "../src/index.js";
import {
  logActivity,
  recordHeartbeat,
  recordSignIn,
  recordActivityEvent,
  touchPresence,
  pruneActiveMinutes,
  resetPresenceMemory,
} from "../src/server/index.js";
import {
  seedUser,
  seedClient,
  seedPlan,
  seedClientPlan,
  seedPayment,
  seedFollowUp,
  seedAssignment,
  seedMilestone,
} from "./helpers.js";

type Role = Parameters<typeof seedUser>[0]["role"];

/** Run `fn` the way a request does: inside an audit context, flushed after. */
async function asRequest<T>(
  actor: { id: string; role: Role } | undefined,
  fn: (ctx: AuditContext) => Promise<T>,
): Promise<{ result: T; ctx: AuditContext }> {
  const ctx = createAuditContext({ requestId: `req-${Math.random()}`, source: "request" });
  ctx.actor = actor;
  const result = await runWithAuditContext(ctx, () => fn(ctx));
  return { result, ctx };
}

beforeEach(() => resetPresenceMemory());

describe("Team Pulse: change capture", () => {
  it("captures a gateway (enhanced) update with the real actor, verb, diff and client", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    await seedClient({ id: "c1" });
    await seedAssignment({ clientId: "c1", staffId: "cro1", role: "cro" });
    const fu = await seedFollowUp({ clientId: "c1", croId: "cro1" });

    const { result, ctx } = await asRequest({ id: "cro1", role: "cro" }, async () =>
      getEnhancedPrisma({ id: "cro1", role: "cro" }).followUp.update({
        where: { id: fu.id },
        data: { status: "completed", completedDate: new Date() },
        select: { id: true },
      }),
    );
    // The caller's narrow select is preserved despite the widened capture read.
    expect(Object.keys(result)).toEqual(["id"]);
    expect(ctx.pending).toHaveLength(1);

    await flushRequestAudit(ctx);
    const rows = await prisma.activityLog.findMany();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      entityType: "FollowUp",
      entityId: fu.id,
      verb: "followup.completed",
      kind: "change",
      module: "cro",
      action: "status_changed",
      performedById: "cro1",
      actorRole: "cro",
      source: "request",
      requestId: ctx.requestId,
      clientId: "c1",
    });
    const changes = row.changes as Record<string, [unknown, unknown]>;
    expect(changes.status).toEqual(["pending", "completed"]);
    expect(changes.updatedAt).toBeUndefined();
  });

  it("records nothing for a write denied by policy", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "cro2", role: "cro" });
    await seedClient({ id: "c1" });
    const fu = await seedFollowUp({ clientId: "c1", croId: "cro1" });
    const { ctx } = await asRequest({ id: "cro2", role: "cro" }, async () =>
      getEnhancedPrisma({ id: "cro2", role: "cro" })
        .followUp.update({ where: { id: fu.id }, data: { status: "completed" } })
        .catch(() => undefined),
    );
    expect(ctx.pending).toHaveLength(0);
  });

  it("does not capture without a context (seeds, scripts)", async () => {
    await seedClient({ id: "c1" });
    await prisma.client.update({ where: { id: "c1" }, data: { city: "Kochi" } });
    expect(await prisma.activityLog.count()).toBe(0);
  });

  it("captures creates, deletes and only the rows a bulk update actually touched", async () => {
    await seedUser({ id: "f1", role: "founder" });
    await seedUser({ id: "cro1", role: "cro" });
    await seedClient({ id: "c1" });
    await seedFollowUp({ clientId: "c1", croId: "cro1" });
    await seedFollowUp({ clientId: "c1", croId: "cro1" });

    const { ctx } = await asRequest({ id: "f1", role: "founder" }, async () => {
      // A lost conditional guard (0 rows) must leave no trace.
      await prisma.followUp.updateMany({ where: { clientId: "c1", status: "completed" }, data: { notes: "x" } });
      await prisma.followUp.updateMany({ where: { clientId: "c1" }, data: { notes: "checked" } });
      const task = await prisma.task.create({ data: { title: "Call back", assignedById: "f1", assignedToId: "cro1", clientId: "c1" } as never });
      await prisma.task.delete({ where: { id: (task as { id: string }).id } });
    });
    const verbs = ctx.pending.map((p) => p.verb);
    expect(verbs).toEqual(["followUp.updated", "followUp.updated", "task.created", "task.deleted"]);
    expect(ctx.pending[0]!.changes.notes).toEqual([null, "checked"]);
    // A delete keeps the deleted row's values.
    expect(ctx.pending[3]!.changes.title).toEqual(["Call back", null]);
  });

  it("records each bulk-created row under its real id", async () => {
    await seedUser({ id: "ops1", role: "ops_head" });
    await seedClient({ id: "c1" });
    const { ctx } = await asRequest({ id: "ops1", role: "ops_head" }, async () =>
      prisma.followUp.createMany({
        data: [
          { clientId: "c1", croId: "ops1", dueDate: new Date(), type: "weekly_checkin" },
          { clientId: "c1", croId: "ops1", dueDate: new Date(), type: "weekly_checkin" },
        ],
      }),
    );
    const ids = (await prisma.followUp.findMany({ select: { id: true } })).map((r) => r.id).sort();
    expect(ctx.pending.map((p) => p.entityId).sort()).toEqual(ids);
  });

  it("resolves the client of a payment through its plan at flush time", async () => {
    await seedUser({ id: "f1", role: "founder" });
    await seedClient({ id: "c1" });
    const plan = await seedPlan();
    const cp = await seedClientPlan("c1", plan.id);
    const ms = await seedMilestone(cp.id, 1);
    const { ctx } = await asRequest({ id: "f1", role: "founder" }, async () =>
      prisma.paymentMilestone.update({ where: { id: ms.id }, data: { amount: 12345 } }),
    );
    await flushRequestAudit(ctx);
    const row = await prisma.activityLog.findFirstOrThrow();
    expect(row.clientId).toBe("c1");
    expect(row.module).toBe("payments");
  });

  it("named events record the request's actor, keeping a different caller-supplied user as the subject", async () => {
    await seedUser({ id: "ops1", role: "ops_head" });
    await seedUser({ id: "cons1", role: "skincare_consultant" });
    await seedClient({ id: "c1" });
    const plan = await seedPlan();
    const cp = await seedClientPlan("c1", plan.id);
    const pay = await seedPayment(cp.id);
    await asRequest({ id: "ops1", role: "ops_head" }, async () =>
      prisma.$transaction(async (tx) => {
        await logActivity(tx, {
          entityType: "Payment",
          entityId: (pay as { id: string }).id,
          action: "status_changed",
          verb: "payment.approved",
          performedById: "cons1",
          summary: "Payment approved",
        });
      }),
    );
    const row = await prisma.activityLog.findFirstOrThrow();
    expect(row).toMatchObject({
      entityType: "Payment",
      verb: "payment.approved",
      performedById: "ops1",
      actorRole: "ops_head",
      clientId: "c1",
      module: "payments",
    });
    expect(row.meta).toEqual({ subjectId: "cons1" });
  });
});

describe("Team Pulse: access", () => {
  it("only founders can read ActivityLog through the gateway; presence tables are closed to everyone", async () => {
    await seedUser({ id: "f1", role: "founder" });
    await seedUser({ id: "ops1", role: "ops_head" });
    await seedClient({ id: "c1" });
    await prisma.activityLog.create({
      data: { entityType: "Client", entityId: "c1", action: "updated", performedById: "f1" },
    });
    await touchPresence("ops1", new Date());

    expect(await getEnhancedPrisma({ id: "f1", role: "founder" }).activityLog.findMany()).toHaveLength(1);
    expect(await getEnhancedPrisma({ id: "ops1", role: "ops_head" }).activityLog.findMany()).toHaveLength(0);
    expect(await getEnhancedPrisma({ id: "f1", role: "founder" }).staffDay.findMany()).toHaveLength(0);
    await expect(
      getEnhancedPrisma({ id: "ops1", role: "ops_head" }).activeMinute.create({
        data: { userId: "ops1", minute: new Date(), module: "cro" },
      }),
    ).rejects.toThrow();
  });
});

describe("Team Pulse: presence", () => {
  it("work days roll over at 4 am IST", () => {
    // 03:59 IST on 3 Oct = 22:29 UTC on 2 Oct -> still the 2 Oct work day.
    expect(workDayKey(new Date("2026-10-02T22:29:00Z"))).toBe("2026-10-02");
    // 04:00 IST on 3 Oct = 22:30 UTC on 2 Oct -> the 3 Oct work day.
    expect(workDayKey(new Date("2026-10-02T22:30:00Z"))).toBe("2026-10-03");
  });

  it("heartbeats in the same minute (several tabs) count once; the day spans first to last", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const t0 = new Date("2026-10-02T04:11:10Z"); // 09:41 IST
    expect(await recordHeartbeat("cro1", "cro", t0)).toBe(true);
    expect(await recordHeartbeat("cro1", "payments", new Date(t0.getTime() + 20_000))).toBe(false);
    await recordHeartbeat("cro1", "payments", new Date("2026-10-02T12:42:00Z")); // 18:12 IST

    expect(await prisma.activeMinute.count()).toBe(2);
    const day = await prisma.staffDay.findFirstOrThrow({ where: { userId: "cro1" } });
    expect(day.day.toISOString().slice(0, 10)).toBe("2026-10-02");
    expect(day.activeMinutes).toBe(2);
    expect(day.firstSeenAt.toISOString()).toBe("2026-10-02T04:11:10.000Z");
    expect(day.lastSeenAt.toISOString()).toBe("2026-10-02T12:42:00.000Z");
  });

  it("records a sign-in once per auth session, and never for founders", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "f1", role: "founder" });
    await recordSignIn({ userId: "cro1", role: "cro", sessionId: "s-1", ip: "1.2.3.4", userAgent: "UA" });
    await recordSignIn({ userId: "cro1", role: "cro", sessionId: "s-1" });
    resetPresenceMemory(); // a restarted process must not re-log it either
    await recordSignIn({ userId: "cro1", role: "cro", sessionId: "s-1" });
    await recordSignIn({ userId: "f1", role: "founder", sessionId: "s-2" });

    expect(await prisma.authSession.count()).toBe(1);
    const events = await prisma.activityLog.findMany({ where: { kind: "auth" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ verb: "auth.signed_in", performedById: "cro1" });
    expect(events[0]!.meta).toEqual({ ip: "1.2.3.4", userAgent: "UA" });
  });

  it("collapses repeat client views within 30 minutes and counts them on the day", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    await seedClient({ id: "c1" });
    const view = {
      actor: { id: "cro1", role: "cro" as const },
      verb: "client.viewed",
      kind: "view" as const,
      entityType: "Client",
      entityId: "c1",
      clientId: "c1",
      module: "clients" as const,
    };
    // Two simultaneous opens (React StrictMode) still record one view.
    const first = await Promise.all([recordActivityEvent(view), recordActivityEvent(view)]);
    expect(first.filter(Boolean)).toHaveLength(1);
    expect(await recordActivityEvent(view)).toBe(false);
    expect(await recordActivityEvent({ ...view, actor: { id: "f1", role: "founder" } })).toBe(false);
    expect(await prisma.activityLog.count({ where: { kind: "view" } })).toBe(1);
    expect((await prisma.staffDay.findFirstOrThrow()).viewCount).toBe(1);
  });

  it("prunes minute-level presence older than 6 months", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const now = new Date("2026-10-04T06:00:00Z");
    await recordHeartbeat("cro1", "cro", new Date("2026-03-01T06:00:00Z"));
    await recordHeartbeat("cro1", "cro", new Date("2026-09-01T06:00:00Z"));
    expect(await pruneActiveMinutes(now)).toBe(1);
    expect(await prisma.activeMinute.count()).toBe(1);
    expect(await prisma.staffDay.count()).toBe(2); // daily totals are kept
  });
});

describe("Team Pulse: founder read side", () => {
  async function log(row: {
    at: string;
    actor: string;
    role: Role;
    verb: string;
    entityType: string;
    entityId: string;
    requestId?: string;
    summary?: string;
    clientId?: string;
    changes?: Record<string, unknown>;
    kind?: "change" | "view" | "export" | "auth";
  }) {
    await prisma.activityLog.create({
      data: {
        createdAt: new Date(row.at),
        performedById: row.actor,
        actorRole: row.role,
        verb: row.verb,
        kind: row.kind ?? "change",
        entityType: row.entityType,
        entityId: row.entityId,
        action: "updated",
        requestId: row.requestId ?? null,
        summary: row.summary ?? null,
        clientId: row.clientId ?? null,
        changes: (row.changes ?? undefined) as never,
      },
    });
  }

  it("CRO follow-up timeliness compares the completion time with the due day (IST)", async () => {
    const { computeStaffMetrics } = await import("../src/server/index.js");
    await seedUser({ id: "cro1", role: "cro" });
    await seedClient({ id: "c1" });
    const onTime = await prisma.followUp.create({
      data: { clientId: "c1", croId: "cro1", type: "weekly_checkin", dueDate: new Date("2026-10-01T00:00:00Z") },
    });
    const late = await prisma.followUp.create({
      data: { clientId: "c1", croId: "cro1", type: "weekly_checkin", dueDate: new Date("2026-09-28T00:00:00Z") },
    });
    // 1 Oct 23:00 IST = still the due day; 2 Oct 10:00 IST = 4 days after 28 Sep.
    await log({ at: "2026-10-01T17:30:00Z", actor: "cro1", role: "cro", verb: "followup.completed", entityType: "FollowUp", entityId: onTime.id });
    await log({ at: "2026-10-02T04:30:00Z", actor: "cro1", role: "cro", verb: "followup.completed", entityType: "FollowUp", entityId: late.id });
    await log({ at: "2026-10-02T05:00:00Z", actor: "cro1", role: "cro", verb: "payment.recorded", entityType: "Payment", entityId: "p1", changes: { amount: 25000 } });

    const m = (await computeStaffMetrics([{ id: "cro1", role: "cro" }], new Date("2026-09-30T00:00:00Z"), new Date("2026-10-03T00:00:00Z"))).get("cro1")!;
    expect(m.outputs.find((o) => o.key === "followups")?.value).toBe("2");
    expect(m.outputs.find((o) => o.key === "payments")).toMatchObject({ value: "1", hint: "₹25,000" });
    expect(m.timeliness.find((t) => t.key === "followupsOnTime")).toMatchObject({ value: "50%" });
    expect(m.timeliness.find((t) => t.key === "followupsOnTime")?.hint).toMatch(/^1 of 2 late, median 4d$/);
  });

  it("the feed folds a request's generic changes under its named event and hides founders", async () => {
    const { pulseFeed } = await import("../src/server/index.js");
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "f1", role: "founder" });
    await seedClient({ id: "c1" });
    await log({ at: "2026-10-02T05:00:00Z", actor: "cro1", role: "cro", verb: "payment.approved", entityType: "Payment", entityId: "p1", requestId: "r1", summary: "Payment approved", clientId: "c1" });
    await log({ at: "2026-10-02T05:00:00Z", actor: "cro1", role: "cro", verb: "payment.updated", entityType: "Payment", entityId: "p1", requestId: "r1", clientId: "c1", changes: { status: ["pending_review", "approved"] } });
    await log({ at: "2026-10-02T05:00:01Z", actor: "cro1", role: "cro", verb: "client.status_changed", entityType: "Client", entityId: "c1", requestId: "r1", clientId: "c1" });
    await log({ at: "2026-10-02T06:00:00Z", actor: "f1", role: "founder", verb: "settings.changed", entityType: "Plan", entityId: "pl1", requestId: "r2" });

    const team = await pulseFeed({});
    expect(team.entries).toHaveLength(1);
    const [e] = team.entries;
    expect(e).toMatchObject({ verb: "payment.approved", client: { id: "c1", name: "Client c1" }, actor: { id: "cro1" } });
    expect(e!.details.map((d) => d.verb).sort()).toEqual(["client.status_changed", "payment.updated"]);

    expect((await pulseFeed({ includeFounders: true })).entries).toHaveLength(2);
    expect((await pulseFeed({ clientId: "c1" })).entries).toHaveLength(1);
    expect((await pulseFeed({ q: "Client c1" })).entries).toHaveLength(1);

    // Keyset pagination walks the whole log without repeats.
    const p1 = await pulseFeed({ includeFounders: true, limit: 1 });
    const p2 = await pulseFeed({ includeFounders: true, limit: 3, cursor: p1.nextCursor! });
    expect(p1.entries[0]!.verb).toBe("settings.changed");
    expect(p2.entries[0]!.verb).toBe("payment.approved");
  });

  it("day overview: blocks from active minutes, one tick per request, live presence today", async () => {
    const { pulseDay } = await import("../src/server/index.js");
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "f1", role: "founder" });
    const base = new Date("2026-10-02T04:00:00Z"); // 9:30 IST
    for (const offset of [0, 1, 2, 30, 31]) await recordHeartbeat("cro1", "cro", new Date(base.getTime() + offset * 60_000));
    await log({ at: "2026-10-02T04:01:00Z", actor: "cro1", role: "cro", verb: "followup.completed", entityType: "FollowUp", entityId: "x", requestId: "r1" });
    await log({ at: "2026-10-02T04:01:00Z", actor: "cro1", role: "cro", verb: "followUp.updated", entityType: "FollowUp", entityId: "x", requestId: "r1" });

    const now = new Date(base.getTime() + 32 * 60_000);
    const { rows, isToday } = await pulseDay("2026-10-02", now);
    expect(isToday).toBe(true);
    expect(rows.map((r) => r.staff.id)).toEqual(["cro1"]); // founders never listed
    const [r] = rows;
    expect(r!.blocks).toEqual([
      ["2026-10-02T04:00:00.000Z", "2026-10-02T04:03:00.000Z"],
      ["2026-10-02T04:30:00.000Z", "2026-10-02T04:32:00.000Z"],
    ]);
    expect(r!.ticks).toHaveLength(1);
    expect(r!.actions).toBe(1);
    expect(r!.stats?.activeMinutes).toBe(5);
    expect(r!.presence).toMatchObject({ state: "active", module: "cro" });
  });
});

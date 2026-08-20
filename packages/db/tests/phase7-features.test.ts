import { describe, expect, it } from "vitest";
import { prisma } from "../src/index.js";
import { updateWeddingDate } from "../src/server/index.js";
import { seedUser, seedClient, seedAssignment } from "./helpers.js";

async function seedWeddingScene() {
  await seedUser({ id: "ops1", role: "ops_head" });
  await seedUser({ id: "cro1", role: "cro" });
  await seedUser({ id: "sk1", role: "skincare_consultant" });
  const c = await seedClient({
    id: "c1",
    status: "active",
    weddingDate: new Date("2026-12-01T00:00:00.000Z"),
  });
  await seedAssignment({ clientId: c.id, staffId: "cro1", role: "cro" });
  await seedAssignment({ clientId: c.id, staffId: "sk1", role: "skincare_consultant" });
  const plan = await prisma.plan.create({
    data: {
      name: "Plan",
      clientType: "groom",
      durationMonths: 3,
      price: 90000,
      installmentCount: 1,
      services: {
        create: [
          { serviceType: "skincare", totalSessions: 3, startOffsetDays: 60, frequencyDays: 14 },
        ],
      },
    },
  });
  const cp = await prisma.clientPlan.create({
    data: {
      clientId: c.id,
      planId: plan.id,
      planNameSnapshot: "Plan",
      priceAtEnrollment: 90000,
      durationMonths: 3,
      servicesSnapshot: [
        { serviceType: "skincare", totalSessions: 3, startOffsetDays: 60, frequencyDays: 14 },
      ],
    },
  });
  return { c, cp };
}

describe("Phase 7 — FEAT-5: wedding-date recalculation (SRS §24.1)", () => {
  it("reschedules future sessions against the new wedding date and keeps history", async () => {
    const { c } = await seedWeddingScene();
    const { activateClientPlan } = await import("../src/server/index.js");
    await activateClientPlan(c.id);

    const before = await prisma.session.findMany({
      where: { clientId: c.id, status: "scheduled" },
      orderBy: { sessionNumber: "asc" },
    });
    expect(before).toHaveLength(3);

    // Complete the first session — it must NOT move with the wedding date.
    await prisma.session.update({
      where: { id: before[0].id },
      data: { status: "completed", actualDate: new Date() },
    });

    const newWedding = new Date("2027-02-01T00:00:00.000Z");
    const result = await updateWeddingDate({ clientId: c.id, weddingDate: newWedding, actorId: "ops1" });
    expect(result.sessionsRescheduled).toBe(2);

    const client = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(client.weddingDate).toEqual(newWedding);

    const after = await prisma.session.findMany({
      where: { clientId: c.id },
      orderBy: { sessionNumber: "asc" },
    });
    // Session 1 (completed) keeps its original date; 2 and 3 moved later.
    expect(after[0].status).toBe("completed");
    expect(after[0].scheduledDate).toEqual(before[0].scheduledDate);
    expect(after[1].scheduledDate.getTime()).toBeGreaterThan(before[1].scheduledDate.getTime());
    expect(after[2].scheduledDate.getTime()).toBeGreaterThan(before[2].scheduledDate.getTime());
    // originalScheduledDate preserved for the moved ones (DATA-2).
    expect(after[1].originalScheduledDate).toEqual(before[1].scheduledDate);

    const logs = await prisma.activityLog.count({ where: { entityType: "client", entityId: c.id } });
    expect(logs).toBeGreaterThanOrEqual(1);
  });
});

import { describe, expect, it } from "vitest";
import { prisma, getEnhancedPrisma } from "../src/index.js";
import { seedAssignment, seedClient, seedUser, type SeedUser } from "./helpers.js";

/**
 * Pre-Consultation Assessment access (GTB, Oct 2026): facial photos and
 * health answers are readable by admins and the client's assigned CRO,
 * skincare consultant and fitness trainer only. Coaches and stylists lose
 * access. The client reads their own assessment, never sees skin photos as
 * documents, and of a versioned plan sees only the active version.
 */
function as(id: string, role: SeedUser["role"]) {
  return getEnhancedPrisma({ id, role });
}

async function world() {
  const staff: [string, SeedUser["role"]][] = [
    ["cro", "cro"],
    ["skin", "skincare_consultant"],
    ["fit", "fitness_trainer"],
    ["coach", "coach"],
    ["stylist", "styling_consultant"],
  ];
  for (const [id, role] of staff) await seedUser({ id, role });
  await seedUser({ id: "ops", role: "ops_head" });
  await seedUser({ id: "otherSkin", role: "skincare_consultant" });
  await seedUser({ id: "clientUser", role: "client" });
  await seedClient({ id: "c1", userId: "clientUser" });
  for (const [id, role] of staff) {
    await seedAssignment({ clientId: "c1", staffId: id, role });
  }
  const assessment = await prisma.assessment.create({
    data: {
      clientId: "c1",
      skinType: "oily",
      healthConditionFlag: true,
      healthConditions: "knee injury",
      submittedAt: new Date(),
    },
  });
  const photoDoc = await prisma.document.create({
    data: {
      clientId: "c1",
      type: "skin_photo",
      fileName: "front.jpg",
      fileUrl: "c1/skin_photo/front.jpg",
      fileSize: 1,
      uploadedById: "clientUser",
    },
  });
  await prisma.skinPhoto.create({
    data: { assessmentId: assessment.id, angle: "front", documentId: photoDoc.id },
  });
  const v1 = await prisma.document.create({
    data: {
      clientId: "c1",
      type: "skincare_plan",
      fileName: "plan-v1.pdf",
      fileUrl: "c1/skincare_plan/v1.pdf",
      fileSize: 1,
      uploadedById: "ops",
      version: 1,
      status: "superseded",
    },
  });
  const v2 = await prisma.document.create({
    data: {
      clientId: "c1",
      type: "skincare_plan",
      fileName: "plan-v2.pdf",
      fileUrl: "c1/skincare_plan/v2.pdf",
      fileSize: 1,
      uploadedById: "ops",
      version: 2,
      status: "active",
    },
  });
  return { assessment, photoDoc, v1, v2 };
}

describe("Pre-consultation: assessment and skin photo visibility", () => {
  it.each([
    ["ops", "ops_head"],
    ["cro", "cro"],
    ["skin", "skincare_consultant"],
    ["fit", "fitness_trainer"],
    ["clientUser", "client"],
  ] as const)("%s can read the assessment and skin photos", async (id, role) => {
    await world();
    const db = as(id, role);
    const a = await db.assessment.findUnique({ where: { clientId: "c1" } });
    expect(a?.healthConditions).toBe("knee injury");
    expect(await db.skinPhoto.count()).toBe(1);
  });

  it.each([
    ["coach", "coach"],
    ["stylist", "styling_consultant"],
    ["otherSkin", "skincare_consultant"],
  ] as const)("%s cannot read the assessment, skin photos or skin photo files", async (id, role) => {
    const { photoDoc } = await world();
    const db = as(id, role);
    expect(await db.assessment.findUnique({ where: { clientId: "c1" } })).toBeNull();
    expect(await db.skinPhoto.count()).toBe(0);
    expect(await db.document.findUnique({ where: { id: photoDoc.id } })).toBeNull();
  });

  it("assigned CRO, skincare and fitness staff can read skin photo documents", async () => {
    const { photoDoc } = await world();
    for (const [id, role] of [
      ["cro", "cro"],
      ["skin", "skincare_consultant"],
      ["fit", "fitness_trainer"],
    ] as const) {
      expect(await as(id, role).document.findUnique({ where: { id: photoDoc.id } })).not.toBeNull();
    }
  });

  it("the client never sees skin photos in their documents", async () => {
    const { photoDoc } = await world();
    expect(
      await as("clientUser", "client").document.findUnique({ where: { id: photoDoc.id } }),
    ).toBeNull();
  });
});

describe("Pre-consultation: versioned plans", () => {
  it("the client sees only the active plan version", async () => {
    const { v1, v2 } = await world();
    const docs = await as("clientUser", "client").document.findMany({
      where: { type: "skincare_plan" },
    });
    expect(docs.map((d) => d.id)).toEqual([v2.id]);
    expect(docs.map((d) => d.id)).not.toContain(v1.id);
  });

  it("staff see every version", async () => {
    await world();
    const docs = await as("skin", "skincare_consultant").document.findMany({
      where: { type: "skincare_plan" },
      orderBy: { version: "asc" },
    });
    expect(docs.map((d) => [d.version, d.status])).toEqual([
      [1, "superseded"],
      [2, "active"],
    ]);
  });
});

describe("Pre-consultation: writes are server-only", () => {
  it("no one can forge a submission through the gateway", async () => {
    await world();
    for (const [id, role] of [
      ["clientUser", "client"],
      ["ops", "ops_head"],
      ["skin", "skincare_consultant"],
    ] as const) {
      await expect(
        as(id, role).assessment.update({
          where: { clientId: "c1" },
          data: { submittedAt: null, consentAccuracy: true },
        }),
      ).rejects.toThrow(/denied by policy|ACCESS_POLICY_VIOLATION|P2004/i);
    }
  });

  it("skin photos and their documents cannot be created through the gateway", async () => {
    const { assessment } = await world();
    const db = as("clientUser", "client");
    await expect(
      db.document.create({
        data: {
          clientId: "c1",
          type: "skin_photo",
          fileName: "x.jpg",
          fileUrl: "elsewhere/x.jpg",
          fileSize: 1,
          uploadedById: "clientUser",
        },
      }),
    ).rejects.toThrow();
    const doc = await prisma.document.findFirstOrThrow({ where: { type: "skin_photo" } });
    await expect(
      db.skinPhoto.create({ data: { assessmentId: assessment.id, angle: "left", documentId: doc.id } }),
    ).rejects.toThrow();
  });
});

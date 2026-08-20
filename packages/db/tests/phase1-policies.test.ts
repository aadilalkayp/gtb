import { describe, expect, it } from "vitest";
import { prisma, getEnhancedPrisma } from "../src/index.js";
import { applySessionRating } from "../src/server/sessionRating.js";
import {
  seedUser,
  seedClient,
  seedPlan,
  seedClientPlan,
  seedInstallment,
  seedAssignment,
  seedSession,
  seedExpenseCategory,
  seedExpense,
  seedDocument,
  seedFollowUp,
  seedAssessment,
} from "./helpers.js";

/** Act as a user through the same enforcement layer the gateway uses. */
function as(id: string, role: Parameters<typeof seedUser>[0]["role"]) {
  return getEnhancedPrisma({ id, role });
}

/** A policy violation throws a Prisma P2004 (ACCESS_POLICY_VIOLATION). */
async function expectDenied(p: Promise<unknown>) {
  await expect(p).rejects.toThrow(/denied by policy|ACCESS_POLICY_VIOLATION|P2004/i);
}

describe("Phase 1 — SEC-1: User privilege escalation", () => {
  it("rejects a client self-upgrade to founder", async () => {
    await seedUser({ id: "attacker", role: "client" });
    const db = as("attacker", "client");
    await expectDenied(db.user.update({ where: { id: "attacker" }, data: { role: "founder" } }));
    const row = await prisma.user.findUniqueOrThrow({ where: { id: "attacker" } });
    expect(row.role).toBe("client");
  });

  it("rejects self-reactivation of a deactivated account", async () => {
    await seedUser({ id: "attacker", role: "client" });
    await prisma.user.update({ where: { id: "attacker" }, data: { isActive: false } });
    const db = as("attacker", "client");
    await expectDenied(db.user.update({ where: { id: "attacker" }, data: { isActive: true } }));
    const row = await prisma.user.findUniqueOrThrow({ where: { id: "attacker" } });
    expect(row.isActive).toBe(false);
  });

  it("rejects self-changes to authId and email", async () => {
    await seedUser({ id: "attacker", role: "coach" });
    const db = as("attacker", "coach");
    await expectDenied(db.user.update({ where: { id: "attacker" }, data: { authId: "other-uid" } }));
    await expectDenied(db.user.update({ where: { id: "attacker" }, data: { email: "evil@test.local" } }));
  });

  it("still allows benign self-updates (name/phone)", async () => {
    await seedUser({ id: "client1", role: "client" });
    const db = as("client1", "client");
    await db.user.update({ where: { id: "client1" }, data: { name: "New Name", phone: "999" } });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: "client1" } });
    expect(row.name).toBe("New Name");
  });

  it("still allows founder to change roles", async () => {
    await seedUser({ id: "staff1", role: "cro" });
    const db = as("founder1", "founder");
    await db.user.update({ where: { id: "staff1" }, data: { role: "ops_head" } });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: "staff1" } });
    expect(row.role).toBe("ops_head");
  });
});

describe("Phase 1 — SEC-2: clients cannot self-approve installments", () => {
  async function seedPaidClient() {
    await seedUser({ id: "client1", role: "client" });
    await seedUser({ id: "cro1", role: "cro" });
    const client = await seedClient({ id: "c1", userId: "client1" });
    await seedAssignment({ clientId: client.id, staffId: "cro1", role: "cro" });
    const plan = await seedPlan();
    const cp = await seedClientPlan(client.id, plan.id);
    return { client, cp };
  }

  it("rejects client setting status: approved on their own installment", async () => {
    const { cp } = await seedPaidClient();
    const inst = await seedInstallment(cp.id, 1);
    const db = as("client1", "client");
    await expectDenied(
      db.installment.update({
        where: { id: inst.id },
        data: { status: "approved", approvedById: "client1", approvedAt: new Date() },
      }),
    );
    const row = await prisma.installment.findUniqueOrThrow({ where: { id: inst.id } });
    expect(row.status).toBe("pending");
    expect(row.approvedById).toBeNull();
  });

  it("rejects client changing the amount", async () => {
    const { cp } = await seedPaidClient();
    const inst = await seedInstallment(cp.id, 1);
    await expectDenied(as("client1", "client").installment.update({ where: { id: inst.id }, data: { amount: 1 } }));
  });

  it("rejects client writing paymentMethod/approvedById/approvedAt", async () => {
    const { cp } = await seedPaidClient();
    const inst = await seedInstallment(cp.id, 1);
    const db = as("client1", "client");
    await expectDenied(db.installment.update({ where: { id: inst.id }, data: { paymentMethod: "upi" } }));
    await expectDenied(db.installment.update({ where: { id: inst.id }, data: { approvedById: "client1" } }));
    await expectDenied(db.installment.update({ where: { id: inst.id }, data: { approvedAt: new Date() } }));
  });

  it("denies the gateway proof-submission write — proofs go through payments/submit-proof only", async () => {
    // Verification pass: the gateway path let a client attach ANY document id
    // (including another client's) as their proof, bypassing the route's
    // ownership check. The client update path is removed entirely; the route
    // flow is covered by the Phase 2 STATE-6 tests.
    const { cp } = await seedPaidClient();
    const inst = await seedInstallment(cp.id, 1);
    const doc = await seedDocument({ clientId: "c1", type: "payment_proof", uploadedById: "client1" });
    await expectDenied(
      as("client1", "client").installment.update({
        where: { id: inst.id },
        data: { status: "proof_submitted", proofDocumentId: doc.id },
      }),
    );
  });

  it("rejects client regressing an approved installment back to proof_submitted", async () => {
    const { cp } = await seedPaidClient();
    const inst = await seedInstallment(cp.id, 1, "approved");
    await expectDenied(
      as("client1", "client").installment.update({ where: { id: inst.id }, data: { status: "proof_submitted" } }),
    );
  });

  it("rejects client regressing proof_submitted back to pending", async () => {
    const { cp } = await seedPaidClient();
    const inst = await seedInstallment(cp.id, 1, "proof_submitted");
    await expectDenied(
      as("client1", "client").installment.update({ where: { id: inst.id }, data: { status: "pending" } }),
    );
  });

  it("still allows a CRO to approve", async () => {
    const { cp } = await seedPaidClient();
    const inst = await seedInstallment(cp.id, 1);
    await as("cro1", "cro").installment.update({
      where: { id: inst.id },
      data: { status: "approved", approvedById: "cro1", approvedAt: new Date() },
    });
    const row = await prisma.installment.findUniqueOrThrow({ where: { id: inst.id } });
    expect(row.status).toBe("approved");
    expect(row.approvedById).toBe("cro1");
  });
});

describe("Phase 1 — SEC-3: clients cannot rewrite their own lifecycle", () => {
  async function seedSelf() {
    await seedUser({ id: "client1", role: "client" });
    return seedClient({ id: "c1", userId: "client1" });
  }

  it("rejects client setting status: active/converted on themselves", async () => {
    await seedSelf();
    const db = as("client1", "client");
    await expectDenied(db.client.update({ where: { id: "c1" }, data: { status: "active" } }));
    await expectDenied(db.client.update({ where: { id: "c1" }, data: { status: "converted" } }));
    const row = await prisma.client.findUniqueOrThrow({ where: { id: "c1" } });
    expect(row.status).toBe("lead");
  });

  it("rejects client changing clientCode/conversionDate/weddingDate/email/city/type", async () => {
    await seedSelf();
    const db = as("client1", "client");
    await expectDenied(db.client.update({ where: { id: "c1" }, data: { clientCode: "GTB9999" } }));
    await expectDenied(db.client.update({ where: { id: "c1" }, data: { conversionDate: new Date() } }));
    await expectDenied(db.client.update({ where: { id: "c1" }, data: { weddingDate: new Date() } }));
    await expectDenied(db.client.update({ where: { id: "c1" }, data: { email: "evil@x.com" } }));
    await expectDenied(db.client.update({ where: { id: "c1" }, data: { city: "Mumbai" } }));
    await expectDenied(db.client.update({ where: { id: "c1" }, data: { type: "bride" } }));
  });

  it("allows forward leadPhase transitions and rejects regressions", async () => {
    const c = await seedSelf();
    const db = as("client1", "client");
    await db.client.update({ where: { id: c.id }, data: { leadPhase: "registered" } });
    await db.client.update({ where: { id: c.id }, data: { leadPhase: "plan_selected" } });
    await db.client.update({ where: { id: c.id }, data: { leadPhase: "payment_submitted" } });
    await expectDenied(db.client.update({ where: { id: c.id }, data: { leadPhase: "registered" } }));
    await expectDenied(db.client.update({ where: { id: c.id }, data: { leadPhase: "new" } }));
  });

  it("allows client profile edits (name/phone)", async () => {
    await seedSelf();
    await as("client1", "client").client.update({
      where: { id: "c1" },
      data: { name: "New Name", phone: "999" },
    });
  });

  it("still allows an assigned coach to change client status", async () => {
    await seedSelf();
    await seedUser({ id: "coach1", role: "coach" });
    await seedAssignment({ clientId: "c1", staffId: "coach1", role: "coach" });
    await as("coach1", "coach").client.update({ where: { id: "c1" }, data: { status: "on_hold" } });
    const row = await prisma.client.findUniqueOrThrow({ where: { id: "c1" } });
    expect(row.status).toBe("on_hold");
  });
});

describe("Phase 1 — SEC-4: clients cannot complete/edit their own sessions", () => {
  async function seedSessionForClient() {
    await seedUser({ id: "client1", role: "client" });
    const client = await seedClient({ id: "c1", userId: "client1" });
    const session = await seedSession({ clientId: client.id, status: "scheduled", sessionNumber: 1 });
    const completed = await seedSession({ clientId: client.id, status: "completed", sessionNumber: 2 });
    return { session, completed };
  }

  it("rejects client completing their own future session via the gateway", async () => {
    const { session } = await seedSessionForClient();
    await expectDenied(
      as("client1", "client").session.update({ where: { id: session.id }, data: { status: "completed" } }),
    );
  });

  it("rejects client rescheduling / editing notes / rating via the gateway", async () => {
    const { session, completed } = await seedSessionForClient();
    const db = as("client1", "client");
    await expectDenied(db.session.update({ where: { id: session.id }, data: { scheduledDate: new Date() } }));
    await expectDenied(db.session.update({ where: { id: session.id }, data: { notes: "forged" } }));
    await expectDenied(db.session.update({ where: { id: session.id }, data: { consultantId: "someone" } }));
    await expectDenied(db.session.update({ where: { id: completed.id }, data: { rating: 5 } }));
  });

  it("denies consultant gateway session writes — completion goes through sessions/complete", async () => {
    // Verification pass: any gateway grant on Session is an every-field grant
    // (ZenStack 2.22 field denies are unsafe on this model), which let a
    // consultant self-award ratings and self-complete sessions without the
    // payout expense or audit row. The consultant path is server-route-only;
    // completeSession's consultant flow is covered by the Phase 2 tests.
    await seedUser({ id: "consultant1", role: "skincare_consultant" });
    await seedClient({ id: "c1" });
    const s = await seedSession({ clientId: "c1", consultantId: "consultant1" });
    await expectDenied(
      as("consultant1", "skincare_consultant").session.update({
        where: { id: s.id },
        data: { status: "completed" },
      }),
    );
  });

  it("still allows admins to update sessions through the gateway", async () => {
    await seedUser({ id: "ops1", role: "ops_head" });
    await seedClient({ id: "c1" });
    const s = await seedSession({ clientId: "c1" });
    await as("ops1", "ops_head").session.update({
      where: { id: s.id },
      data: { notes: "admin edit" },
    });
    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.notes).toBe("admin edit");
  });
});

describe("Phase 1 — SEC-4 route: sessions/rate (client rating path)", () => {
  async function seedRatingScene() {
    await seedUser({ id: "client1", role: "client" });
    await seedUser({ id: "other", role: "client" });
    const client = await seedClient({ id: "c1", userId: "client1" });
    const other = await seedClient({ id: "c2", userId: "other" });
    const completed = await seedSession({ clientId: client.id, status: "completed", sessionNumber: 1 });
    const scheduled = await seedSession({ clientId: client.id, status: "scheduled", sessionNumber: 2 });
    const foreign = await seedSession({ clientId: other.id, status: "completed", sessionNumber: 1 });
    return { completed, scheduled, foreign };
  }

  it("accepts a valid 1-5 rating on an owned completed session", async () => {
    const { completed } = await seedRatingScene();
    const res = await applySessionRating("client1", { sessionId: completed.id, rating: 5, ratingFeedback: "Great" });
    expect(res.ok).toBe(true);
    const row = await prisma.session.findUniqueOrThrow({ where: { id: completed.id } });
    expect(row.rating).toBe(5);
    expect(row.ratingFeedback).toBe("Great");
  });

  it("rejects out-of-range and non-integer ratings", async () => {
    const { completed } = await seedRatingScene();
    for (const bad of [0, 6, 99, 2.5, Number.NaN]) {
      const res = await applySessionRating("client1", { sessionId: completed.id, rating: bad });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
    }
    const row = await prisma.session.findUniqueOrThrow({ where: { id: completed.id } });
    expect(row.rating).toBeNull();
  });

  it("rejects rating a session that is not completed", async () => {
    const { scheduled } = await seedRatingScene();
    const res = await applySessionRating("client1", { sessionId: scheduled.id, rating: 4 });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
  });

  it("rejects rating another client's session", async () => {
    const { foreign } = await seedRatingScene();
    const res = await applySessionRating("client1", { sessionId: foreign.id, rating: 4 });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  it("rejects rating a missing session", async () => {
    const res = await applySessionRating("client1", { sessionId: "nope", rating: 4 });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
  });
});

describe("Phase 1 — SEC-5: gateway Document creation is closed", () => {
  it("rejects client creating a Document row via the gateway (even with a forged fileUrl)", async () => {
    await seedUser({ id: "client1", role: "client" });
    await seedClient({ id: "c1", userId: "client1" });
    await expectDenied(
      as("client1", "client").document.create({
        data: {
          clientId: "c1",
          type: "payment_proof",
          fileName: "x.jpg",
          fileUrl: "client-b/payment_proof/victim.jpg",
          fileSize: 100,
          uploadedById: "client1",
        },
      }),
    );
  });

  it("rejects document delete by anyone but admins", async () => {
    await seedUser({ id: "client1", role: "client" });
    await seedUser({ id: "ops1", role: "ops_head" });
    const client = await seedClient({ id: "c1", userId: "client1" });
    const doc = await seedDocument({ clientId: client.id, type: "client_photo", uploadedById: "client1" });
    await expectDenied(as("client1", "client").document.delete({ where: { id: doc.id } }));
    await as("ops1", "ops_head").document.delete({ where: { id: doc.id } });
  });
});

describe("Phase 1 — SEC-6: no pre-approved self-serving expenses", () => {
  it("rejects non-admin creating an approved expense", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const cat = await seedExpenseCategory();
    await expectDenied(
      as("cro1", "cro").expense.create({
        data: {
          categoryId: cat.id,
          title: "Self payout",
          amount: 500000,
          date: new Date(),
          submittedById: "cro1",
          status: "approved",
          approvedById: "cro1",
          approvedAt: new Date(),
        },
      }),
    );
  });

  it("rejects non-admin spoofing the submitter", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "other", role: "cro" });
    const cat = await seedExpenseCategory();
    await expectDenied(
      as("cro1", "cro").expense.create({
        data: { categoryId: cat.id, title: "x", amount: 100, date: new Date(), submittedById: "other" },
      }),
    );
  });

  it("allows a legitimate submitted expense", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const cat = await seedExpenseCategory();
    const e = await as("cro1", "cro").expense.create({
      data: { categoryId: cat.id, title: "Travel", amount: 1000, date: new Date(), submittedById: "cro1" },
    });
    const row = await prisma.expense.findUniqueOrThrow({ where: { id: e.id } });
    expect(row.status).toBe("submitted");
    expect(row.approvedById).toBeNull();
  });

  it("rejects a submitter approving their own draft via update", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const cat = await seedExpenseCategory();
    const e = await seedExpense({ categoryId: cat.id, submittedById: "cro1" });
    await expectDenied(
      as("cro1", "cro").expense.update({
        where: { id: e.id },
        data: { status: "approved", approvedById: "cro1", approvedAt: new Date() },
      }),
    );
    const row = await prisma.expense.findUniqueOrThrow({ where: { id: e.id } });
    expect(row.status).toBe("submitted");
  });

  it("still allows an ops head to approve", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "ops1", role: "ops_head" });
    const cat = await seedExpenseCategory();
    const e = await seedExpense({ categoryId: cat.id, submittedById: "cro1" });
    await as("ops1", "ops_head").expense.update({
      where: { id: e.id },
      data: { status: "approved", approvedById: "ops1", approvedAt: new Date() },
    });
    const row = await prisma.expense.findUniqueOrThrow({ where: { id: e.id } });
    expect(row.status).toBe("approved");
  });
});

describe("Phase 1 — SEC-10: document visibility matrix (SRS §16.1)", () => {
  async function seedDocs() {
    await seedUser({ id: "client1", role: "client" });
    await seedUser({ id: "cro1", role: "cro" });
    await seedUser({ id: "coach1", role: "coach" });
    await seedUser({ id: "ops1", role: "ops_head" });
    await seedUser({ id: "uploader", role: "cro" });
    const client = await seedClient({ id: "c1", userId: "client1" });
    await seedAssignment({ clientId: client.id, staffId: "cro1", role: "cro" });
    await seedAssignment({ clientId: client.id, staffId: "coach1", role: "coach" });
    const proof = await seedDocument({ clientId: client.id, type: "payment_proof", uploadedById: "uploader" });
    const receipt = await seedDocument({ clientId: client.id, type: "expense_receipt", uploadedById: "uploader" });
    const plan = await seedDocument({ clientId: client.id, type: "skincare_plan", uploadedById: "uploader" });
    return { proof, receipt, plan };
  }

  it("hides payment_proof from an assigned coach", async () => {
    const { proof } = await seedDocs();
    const visible = await as("coach1", "coach").document.findMany({ where: { id: proof.id } });
    expect(visible).toHaveLength(0);
  });

  it("shows payment_proof to an assigned CRO", async () => {
    const { proof } = await seedDocs();
    const visible = await as("cro1", "cro").document.findMany({ where: { id: proof.id } });
    expect(visible).toHaveLength(1);
  });

  it("hides expense_receipt from staff; ops sees it", async () => {
    const { receipt } = await seedDocs();
    expect(await as("cro1", "cro").document.findMany({ where: { id: receipt.id } })).toHaveLength(0);
    expect(await as("ops1", "ops_head").document.findMany({ where: { id: receipt.id } })).toHaveLength(1);
  });

  it("shows ordinary plan documents to any assigned staff", async () => {
    const { plan } = await seedDocs();
    expect(await as("coach1", "coach").document.findMany({ where: { id: plan.id } })).toHaveLength(1);
  });

  it("still hides consultation_notes from the owning client", async () => {
    await seedUser({ id: "client1", role: "client" });
    await seedUser({ id: "uploader", role: "cro" });
    const client = await seedClient({ id: "c1", userId: "client1" });
    const notes = await seedDocument({ clientId: client.id, type: "consultation_notes", uploadedById: "uploader" });
    expect(await as("client1", "client").document.findMany({ where: { id: notes.id } })).toHaveLength(0);
  });
});

describe("Phase 1 — SEC-11: staff PII hidden from clients", () => {
  it("drops email/phone from User rows when read by a client", async () => {
    await seedUser({ id: "staff1", role: "coach" });
    await seedUser({ id: "client1", role: "client" });
    const rows = await as("client1", "client").user.findMany({});
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).not.toHaveProperty("email");
      expect(r).not.toHaveProperty("phone");
    }
  });

  it("still returns email/phone to staff readers", async () => {
    await seedUser({ id: "staff1", role: "coach" });
    const rows = await as("founder1", "founder").user.findMany({});
    expect(rows[0].email).toBeDefined();
    expect(rows[0].phone).toBeDefined();
  });
});

describe("Phase 1 — SEC-14: clients see active plans only", () => {
  it("excludes inactive plans from client reads, not staff reads", async () => {
    await seedUser({ id: "client1", role: "client" });
    await seedUser({ id: "founder1", role: "founder" });
    await prisma.plan.create({ data: { name: "Old", clientType: "groom", durationMonths: 3, price: 1, isActive: false } });
    await prisma.plan.create({ data: { name: "Live", clientType: "groom", durationMonths: 3, price: 2, isActive: true } });
    const clientPlans = await as("client1", "client").plan.findMany({});
    expect(clientPlans.map((p) => p.name)).toEqual(["Live"]);
    const staffPlans = await as("founder1", "founder").plan.findMany({});
    expect(staffPlans).toHaveLength(2);
  });
});

describe("Phase 1 — SEC-16: CRO follow-ups scoped to assigned clients", () => {
  it("rejects a follow-up for a client the CRO is not assigned to", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    await seedClient({ id: "c1" });
    await expectDenied(
      as("cro1", "cro").followUp.create({
        data: { clientId: "c1", croId: "cro1", type: "weekly_checkin", dueDate: new Date() },
      }),
    );
  });

  it("allows a follow-up for an assigned client", async () => {
    await seedUser({ id: "cro1", role: "cro" });
    const client = await seedClient({ id: "c1" });
    await seedAssignment({ clientId: client.id, staffId: "cro1", role: "cro" });
    await as("cro1", "cro").followUp.create({
      data: { clientId: client.id, croId: "cro1", type: "weekly_checkin", dueDate: new Date() },
    });
  });
});

describe("Phase 1 — SEC-17: assessment field scoping", () => {
  it("rejects a fitness trainer writing skincare fields", async () => {
    await seedUser({ id: "trainer1", role: "fitness_trainer" });
    await seedUser({ id: "client1", role: "client" });
    const client = await seedClient({ id: "c1", userId: "client1" });
    await seedAssignment({ clientId: client.id, staffId: "trainer1", role: "fitness_trainer" });
    const a = await seedAssessment(client.id, { dermatologicalNotes: "sensitive" });
    await expectDenied(
      as("trainer1", "fitness_trainer").assessment.update({
        where: { clientId: client.id },
        data: { dermatologicalNotes: "overwritten" },
      }),
    );
    const row = await prisma.assessment.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.dermatologicalNotes).toBe("sensitive");
  });

  it("allows a fitness trainer writing fitness fields", async () => {
    await seedUser({ id: "trainer1", role: "fitness_trainer" });
    await seedUser({ id: "client1", role: "client" });
    const client = await seedClient({ id: "c1", userId: "client1" });
    await seedAssignment({ clientId: client.id, staffId: "trainer1", role: "fitness_trainer" });
    await seedAssessment(client.id, {});
    await as("trainer1", "fitness_trainer").assessment.update({
      where: { clientId: client.id },
      data: { fitnessLevel: "intermediate" },
    });
  });

  it("allows the client wizard upsert including completedAt", async () => {
    await seedUser({ id: "client1", role: "client" });
    const client = await seedClient({ id: "c1", userId: "client1" });
    await seedAssessment(client.id, {});
    const db = as("client1", "client");
    await db.assessment.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, completedAt: new Date(), skinType: "oily" },
      update: { completedAt: new Date(), skinType: "dry" },
    });
    const row = await prisma.assessment.findUniqueOrThrow({ where: { clientId: client.id } });
    expect(row.skinType).toBe("dry");
  });

  it("rejects a client moving the assessment to another client", async () => {
    await seedUser({ id: "client1", role: "client" });
    await seedClient({ id: "c1", userId: "client1" });
    await seedClient({ id: "c2" });
    const a = await seedAssessment("c1", {});
    await expectDenied(
      as("client1", "client").assessment.update({ where: { id: a.id }, data: { clientId: "c2" } }),
    );
  });
});

describe("Phase 1 — record-id immutability (same class as SEC-1..6)", () => {
  it("rejects changing a session id via gateway update", async () => {
    await seedUser({ id: "client1", role: "client" });
    const client = await seedClient({ id: "c1", userId: "client1" });
    const s = await seedSession({ clientId: client.id, status: "completed" });
    await expectDenied(as("client1", "client").session.update({ where: { id: s.id }, data: { id: "hijack" } }));
  });

  it("rejects a client unlinking their own user row", async () => {
    await seedUser({ id: "client1", role: "client" });
    await seedClient({ id: "c1", userId: "client1" });
    await expectDenied(as("client1", "client").client.update({ where: { id: "c1" }, data: { userId: null } }));
  });
});

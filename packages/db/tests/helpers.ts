import { prisma } from "../src/index.js";

/**
 * Truncate every table so each test suite starts from a clean schema state.
 * Runs against the disposable test database only (see .env.test).
 */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const names = tables
    .map((t) => t.tablename)
    .filter((t) => !t.startsWith("_prisma_"))
    .map((t) => `"${t}"`)
    .join(", ");
  if (names) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  }
}

import type { Prisma } from "@prisma/client";

export type SeedUser = {
  id: string;
  role: "founder" | "ops_head" | "cro" | "coach" | "skincare_consultant" | "fitness_trainer" | "styling_consultant" | "media" | "client";
};

export async function seedUser(u: SeedUser) {
  return prisma.user.create({
    data: {
      id: u.id,
      email: `${u.id}@test.local`,
      name: u.id,
      role: u.role,
      isActive: true,
    },
  });
}

export async function seedClient(overrides: Partial<Prisma.ClientCreateInput> & { id: string; userId?: string }) {
  const { id, userId, ...rest } = overrides;
  return prisma.client.create({
    data: {
      id,
      clientCode: `GTB${Math.floor(1000 + Math.random() * 9000)}`,
      name: `Client ${id}`,
      phone: "9000000000",
      email: `${id}@client.test`,
      type: "groom",
      weddingDate: new Date("2026-12-31T00:00:00.000Z"),
      city: "Bengaluru",
      ...(userId ? { user: { connect: { id: userId } } } : {}),
      ...rest,
    },
  });
}

export async function seedPlan() {
  return prisma.plan.create({
    data: {
      name: "Test Plan",
      clientType: "groom",
      durationMonths: 3,
      price: 90000,
      installmentCount: 3,
    },
  });
}

export async function seedClientPlan(clientId: string, planId: string) {
  return prisma.clientPlan.create({
    data: {
      clientId,
      planId,
      planNameSnapshot: "Test Plan",
      priceAtEnrollment: 90000,
      durationMonths: 3,
    },
  });
}

export async function seedInstallment(clientPlanId: string, n: number, status = "pending") {
  return prisma.installment.create({
    data: {
      clientPlanId,
      installmentNumber: n,
      amount: 30000,
      dueDate: new Date("2026-09-30T00:00:00.000Z"),
      status: status as "pending",
    },
  });
}

export async function seedAssignment(args: { clientId: string; staffId: string; role: string; isActive?: boolean }) {
  return prisma.assignment.create({
    data: {
      clientId: args.clientId,
      staffId: args.staffId,
      role: args.role as "cro",
      isActive: args.isActive ?? true,
    },
  });
}

export async function seedSession(args: { clientId: string; serviceType?: string; consultantId?: string; status?: string; sessionNumber?: number }) {
  return prisma.session.create({
    data: {
      clientId: args.clientId,
      serviceType: (args.serviceType ?? "skincare") as "skincare",
      sessionNumber: args.sessionNumber ?? 1,
      scheduledDate: new Date("2026-09-01T00:00:00.000Z"),
      consultantId: args.consultantId,
      status: (args.status ?? "scheduled") as "scheduled",
    },
  });
}

export async function seedExpenseCategory() {
  return prisma.expenseCategory.create({
    data: { name: `Category-${Math.floor(Math.random() * 100000)}` },
  });
}

export async function seedExpense(args: {
  categoryId: string;
  submittedById: string;
  status?: string;
  clientId?: string;
  amount?: number;
}) {
  return prisma.expense.create({
    data: {
      categoryId: args.categoryId,
      title: "Test expense",
      amount: args.amount ?? 500,
      date: new Date("2026-08-01T00:00:00.000Z"),
      submittedById: args.submittedById,
      ...(args.clientId ? { clientId: args.clientId } : {}),
      status: (args.status ?? "submitted") as "submitted",
    },
  });
}

export async function seedDocument(args: {
  clientId: string;
  type: string;
  uploadedById: string;
  fileUrl?: string;
  sessionId?: string;
}) {
  return prisma.document.create({
    data: {
      clientId: args.clientId,
      type: args.type as "payment_proof",
      fileName: "proof.jpg",
      fileUrl: args.fileUrl ?? `${args.clientId}/payment_proof/x.jpg`,
      fileSize: 1000,
      uploadedById: args.uploadedById,
      ...(args.sessionId ? { sessionId: args.sessionId } : {}),
    },
  });
}

export async function seedFollowUp(args: { clientId: string; croId: string; type?: string }) {
  return prisma.followUp.create({
    data: {
      clientId: args.clientId,
      croId: args.croId,
      type: (args.type ?? "weekly_checkin") as "weekly_checkin",
      dueDate: new Date("2026-08-15T00:00:00.000Z"),
    },
  });
}

export async function seedAssessment(clientId: string, overrides: Record<string, unknown> = {}) {
  return prisma.assessment.create({
    data: { clientId, ...overrides },
  });
}

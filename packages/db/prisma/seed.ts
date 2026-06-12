/**
 * Seed script — idempotent. Run with `pnpm --filter @gtb/db seed`.
 *
 * Creates:
 *   - one Founder user (email from SEED_FOUNDER_EMAIL) so you can log in
 *   - default lead sources + expense categories
 *   - two example plans (GTB + Glow, 3-month) with their service rules
 *
 * The Founder's authId is left null; it links to a Supabase auth account on
 * first login (see apps/api/src/lib/auth.ts). Create a Supabase auth user with
 * the SAME email + a password, then sign in.
 */
import "dotenv/config";
import { prisma } from "../src/index.js";

const FOUNDER_EMAIL = (process.env.SEED_FOUNDER_EMAIL ?? "ishaqk16@gmail.com").toLowerCase();
const FOUNDER_NAME = process.env.SEED_FOUNDER_NAME ?? "Ishaq K";

async function main() {
  // --- Founder ---
  const founder = await prisma.user.upsert({
    where: { email: FOUNDER_EMAIL },
    update: { role: "founder", name: FOUNDER_NAME, isActive: true },
    create: { email: FOUNDER_EMAIL, name: FOUNDER_NAME, role: "founder" },
  });
  console.log(`✓ Founder: ${founder.email}`);

  // --- Lead sources ---
  const leadSources = ["Instagram", "Referral", "YouTube", "Google", "Walk-in", "Event"];
  for (const name of leadSources) {
    await prisma.leadSource.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`✓ Lead sources: ${leadSources.length}`);

  // --- Expense categories ---
  const categories = [
    "Consultant Fee",
    "Travel",
    "Accommodation",
    "Product/Material",
    "Software/Tools",
    "Marketing",
    "Office/Operations",
    "Other",
  ];
  for (const name of categories) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`✓ Expense categories: ${categories.length}`);

  // --- Example plans ---
  await seedPlan({
    name: "GTB 3 Month Premium",
    clientType: "groom",
    durationMonths: 3,
    price: 13000,
    installmentCount: 3,
    description: "Complete 3-month groom transformation: skincare, fitness, and styling.",
    services: [
      { serviceType: "skincare", totalSessions: 6, startOffsetDays: 90, frequencyDays: 14 },
      { serviceType: "fitness", totalSessions: 12, startOffsetDays: 90, frequencyDays: 7 },
      { serviceType: "styling", totalSessions: 2, startOffsetDays: 14, frequencyDays: null },
    ],
  });

  await seedPlan({
    name: "Glow 3 Month Premium",
    clientType: "bride",
    durationMonths: 3,
    price: 15000,
    installmentCount: 3,
    description: "Complete 3-month bridal glow-up: skincare, fitness, and styling.",
    services: [
      { serviceType: "skincare", totalSessions: 8, startOffsetDays: 90, frequencyDays: 10 },
      { serviceType: "fitness", totalSessions: 12, startOffsetDays: 90, frequencyDays: 7 },
      { serviceType: "styling", totalSessions: 3, startOffsetDays: 21, frequencyDays: null },
    ],
  });
  console.log("✓ Plans seeded");

  console.log("\nDone. Create a Supabase auth user with email", FOUNDER_EMAIL, "to log in.");
}

interface SeedPlanInput {
  name: string;
  clientType: "groom" | "bride";
  durationMonths: number;
  price: number;
  installmentCount: number;
  description: string;
  services: {
    serviceType: "skincare" | "fitness" | "styling";
    totalSessions: number;
    startOffsetDays: number;
    frequencyDays: number | null;
  }[];
}

async function seedPlan(input: SeedPlanInput) {
  const existing = await prisma.plan.findFirst({ where: { name: input.name } });
  if (existing) return;
  await prisma.plan.create({
    data: {
      name: input.name,
      clientType: input.clientType,
      durationMonths: input.durationMonths,
      price: input.price,
      installmentCount: input.installmentCount,
      description: input.description,
      services: { create: input.services },
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

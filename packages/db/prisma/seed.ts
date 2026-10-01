/**
 * Seed script — idempotent. Run with `pnpm --filter @gtb/db seed`.
 *
 * Creates:
 *   - one Founder user (email from SEED_FOUNDER_EMAIL) so you can log in
 *   - default lead sources + expense categories
 *   - the three live packages (GTB 1/2/3 months) with their service rules
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

  // --- Plans ---
  // Three duration-based packages shown to every client (the portal no longer
  // filters by bride/groom). Plans carry no price: each client's fee is
  // negotiated personally and recorded per client as ClientPlan.agreedPrice.
  await seedPlan({
    name: "GTB (1 Month)",
    clientType: "groom",
    durationMonths: 1,
    description: "One month of skincare, fitness, and styling leading up to your big day.",
    services: [
      { serviceType: "skincare", totalSessions: 2, startOffsetDays: 30, frequencyDays: 14 },
      { serviceType: "fitness", totalSessions: 4, startOffsetDays: 30, frequencyDays: 7 },
      { serviceType: "styling", totalSessions: 1, startOffsetDays: 14, frequencyDays: null },
    ],
  });

  await seedPlan({
    name: "GTB (2 Months)",
    clientType: "groom",
    durationMonths: 2,
    description: "Two months of skincare, fitness, and styling leading up to your big day.",
    services: [
      { serviceType: "skincare", totalSessions: 4, startOffsetDays: 60, frequencyDays: 14 },
      { serviceType: "fitness", totalSessions: 8, startOffsetDays: 60, frequencyDays: 7 },
      { serviceType: "styling", totalSessions: 1, startOffsetDays: 14, frequencyDays: null },
    ],
  });

  await seedPlan({
    name: "GTB (3 Months)",
    clientType: "groom",
    durationMonths: 3,
    description: "Three months of skincare, fitness, and styling leading up to your big day.",
    services: [
      { serviceType: "skincare", totalSessions: 6, startOffsetDays: 90, frequencyDays: 14 },
      { serviceType: "fitness", totalSessions: 12, startOffsetDays: 90, frequencyDays: 7 },
      { serviceType: "styling", totalSessions: 2, startOffsetDays: 14, frequencyDays: null },
    ],
  });
  console.log("✓ Plans seeded");

  console.log("\nDone. Create a Supabase auth user with email", FOUNDER_EMAIL, "to log in.");
}

interface SeedPlanInput {
  name: string;
  clientType: "groom" | "bride";
  durationMonths: number;
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

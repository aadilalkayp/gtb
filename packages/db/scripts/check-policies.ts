/**
 * Policy smoke-test against the live DB. Verifies the ZenStack access-policy
 * engine grants and denies correctly under Prisma 7. Run:
 *   pnpm --filter @gtb/db exec tsx scripts/check-policies.ts
 */
import "dotenv/config";
import { prisma, getEnhancedPrisma } from "../src/index.js";

async function main() {
  const founder = await prisma.user.findFirst({ where: { role: "founder" } });
  if (!founder) throw new Error("No founder user — run the seed first.");

  const asFounder = getEnhancedPrisma({ id: founder.id, role: founder.role });
  const asAnon = getEnhancedPrisma(undefined);

  const founderPlans = await asFounder.plan.findMany();
  const anonPlans = await asAnon.plan.findMany();
  const founderUsers = await asFounder.user.findMany();
  const anonUsers = await asAnon.user.findMany();

  console.log("founder → plans:", founderPlans.length, "(expect ≥2)");
  console.log("anon    → plans:", anonPlans.length, "(expect 0)");
  console.log("founder → users:", founderUsers.length, "(expect ≥1)");
  console.log("anon    → users:", anonUsers.length, "(expect 0)");

  const pass =
    founderPlans.length >= 2 &&
    anonPlans.length === 0 &&
    founderUsers.length >= 1 &&
    anonUsers.length === 0;

  console.log(pass ? "\n✓ POLICY CHECK PASS" : "\n✗ POLICY CHECK FAIL");
  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * Server-only entry for @gtb/db.
 *
 * Exposes the base Prisma client (bypasses access policies — use sparingly for
 * trusted server work like notifications and audit logging) and a factory for
 * the ZenStack-enhanced client that enforces the schema's access policies for a
 * given user.
 *
 * Do NOT import this from the web app — it pulls in the Prisma runtime. The web
 * app uses `@gtb/db/hooks` and `@gtb/db/models` (types only).
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { enhance } from "@zenstackhq/runtime";
import type { Role } from "@prisma/client";

/**
 * Auth context consumed by the schema's `auth()` policies. The index signature
 * satisfies ZenStack's `enhance()` user-context contract.
 */
export interface AuthUser {
  id: string;
  role: Role;
  [key: string]: unknown;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7 connects through a driver adapter. Runtime uses the pooled URL.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Returns a Prisma client that enforces row- and field-level access policies
 * for the given user. Pass `undefined` for an anonymous (unauthenticated)
 * context — all policy checks will then fail closed.
 */
export function getEnhancedPrisma(user: AuthUser | undefined) {
  return enhance(prisma, { user });
}

export type EnhancedPrisma = ReturnType<typeof getEnhancedPrisma>;

export { Prisma };
export * from "@prisma/client";

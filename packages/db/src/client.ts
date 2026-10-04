import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withAuditCapture } from "./audit/capture.js";

/**
 * The two Prisma clients behind @gtb/db.
 *
 * - `rawPrisma`: the plain client. Internal to this package (audit flush,
 *   presence, before-state reads), never exported, because writes through it
 *   are not audited.
 * - `prisma`: the same connection with Team Pulse change capture. This is what
 *   every route, domain helper and the ZenStack gateway (via enhance()) uses.
 *   The capture extension adds no API surface, so it is typed as PrismaClient.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; rawPrisma?: PrismaClient };

// Prisma 7 connects through a driver adapter. Runtime uses the pooled URL.
export const rawPrisma: PrismaClient =
  globalForPrisma.rawPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? (withAuditCapture(rawPrisma) as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.rawPrisma = rawPrisma;
  globalForPrisma.prisma = prisma;
}

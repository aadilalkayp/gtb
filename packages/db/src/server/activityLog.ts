import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../index.js";

/**
 * SYS-1: append an ActivityLog row (SRS §23.3). Pass a transaction client when
 * called from inside a `$transaction` so the audit entry commits with the
 * action it records; the base client is used for standalone calls.
 *
 * ActivityLog has no create policy in the schema — server-writes only.
 */
export async function logActivity(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    entityType: string;
    entityId: string;
    action: "created" | "updated" | "deleted" | "status_changed";
    performedById?: string | null;
    summary?: string;
    changes?: Record<string, unknown>;
  },
): Promise<void> {
  await db.activityLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      performedById: input.performedById ?? null,
      summary: input.summary ?? null,
      changes: (input.changes as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    },
  });
}

/** Convenience: log with the base client (no surrounding transaction). */
export async function logActivityStandalone(
  input: Parameters<typeof logActivity>[1],
): Promise<void> {
  await logActivity(prisma, input);
}

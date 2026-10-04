import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { moduleForModel } from "@gtb/shared";
import { prisma } from "../index.js";
import { getAuditContext } from "../audit/context.js";
import { resolveClientIdById } from "../audit/clients.js";

/**
 * SYS-1: append a named domain event to ActivityLog (SRS §23.3, Team Pulse
 * §5.3). Pass a transaction client when called from inside a `$transaction` so
 * the entry commits with the action it records; the base client is used for
 * standalone calls.
 *
 * Inside a request, the actor is the authenticated caller from the audit
 * context: whoever actually performed the action. `performedById` is only the
 * fallback for context-free callers (scripts, tests). When a caller passes a
 * different user (e.g. the session's consultant), it is kept as
 * `meta.subjectId` rather than misattributing the action.
 *
 * ActivityLog has no create policy in the schema: server writes only.
 */
export async function logActivity(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    entityType: string;
    entityId: string;
    action: "created" | "updated" | "deleted" | "status_changed";
    /** Precise event name, e.g. "payment.approved" (see packages/shared activity.ts). */
    verb?: string;
    performedById?: string | null;
    summary?: string;
    changes?: Record<string, unknown>;
  },
): Promise<void> {
  const ctx = getAuditContext();
  // Callers historically used lowercase entity names; store Prisma model names
  // so named events line up with captured changes.
  const entityType = input.entityType.charAt(0).toUpperCase() + input.entityType.slice(1);
  const performedById = ctx?.actor?.id ?? input.performedById ?? null;
  const subjectId =
    input.performedById && input.performedById !== performedById ? input.performedById : undefined;

  await db.activityLog.create({
    data: {
      entityType,
      entityId: input.entityId,
      action: input.action,
      verb: input.verb ?? null,
      kind: "change",
      module: moduleForModel(entityType),
      performedById,
      actorRole: ctx?.actor?.role ?? null,
      source: ctx?.source ?? null,
      requestId: ctx?.requestId ?? null,
      clientId: await resolveClientIdById(db, entityType, input.entityId),
      summary: input.summary ?? null,
      changes: (input.changes as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      meta: subjectId ? { subjectId } : Prisma.JsonNull,
    },
  });
}

/** Convenience: log with the base client (no surrounding transaction). */
export async function logActivityStandalone(
  input: Parameters<typeof logActivity>[1],
): Promise<void> {
  await logActivity(prisma, input);
}

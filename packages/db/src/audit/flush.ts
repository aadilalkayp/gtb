import { Prisma, type PrismaClient } from "@prisma/client";
import { moduleForModel } from "@gtb/shared";
import type { AuditContext, PendingChange } from "./context.js";
import { resolveClientId } from "./clients.js";

function actionFor(e: PendingChange): "created" | "updated" | "deleted" | "status_changed" {
  if (e.op === "create") return "created";
  if (e.op === "delete") return "deleted";
  return "status" in e.changes ? "status_changed" : "updated";
}

/**
 * Persist the request's captured changes (TEAM_PULSE_DESIGN.md §5.2). Called by
 * the API after a successful response, i.e. after every transaction in the
 * request has committed, which is also why client resolution waits until now:
 * a payment created in the same transaction as its plan is visible only after
 * commit. Returns the number of rows written.
 */
export async function flushAudit(raw: PrismaClient, ctx: AuditContext): Promise<number> {
  const entries = ctx.pending.splice(0);
  if (entries.length === 0) return 0;

  const cache = new Map<string, string | null>();
  const clientIds: Array<string | null> = [];
  for (const e of entries) clientIds.push(await resolveClientId(raw, e.model, e.row, cache));

  await raw.activityLog.createMany({
    data: entries.map((e, i) => ({
      createdAt: e.at,
      entityType: e.model,
      entityId: e.entityId,
      action: actionFor(e),
      verb: e.verb,
      kind: "change" as const,
      module: moduleForModel(e.model),
      performedById: ctx.actor?.id ?? null,
      actorRole: ctx.actor?.role ?? null,
      source: ctx.source,
      requestId: ctx.requestId,
      clientId: clientIds[i] ?? null,
      changes: Object.keys(e.changes).length > 0 ? (e.changes as Prisma.InputJsonValue) : Prisma.JsonNull,
    })),
  });
  return entries.length;
}

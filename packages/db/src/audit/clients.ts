import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;
type Row = Record<string, unknown>;

/**
 * Which client an audited row concerns, so a client's full history is one
 * indexed query on ActivityLog.clientId. Direct for rows that carry clientId,
 * one hop through the parent for payments and fitness children.
 *
 * `cache` is shared across one flush so a batch of milestone rows for the same
 * plan costs one lookup.
 */
export async function resolveClientId(
  db: Db,
  model: string,
  row: Row,
  cache: Map<string, string | null> = new Map(),
): Promise<string | null> {
  if (model === "Client") return typeof row.id === "string" ? row.id : null;
  if (typeof row.clientId === "string") return row.clientId;

  const lookup = async (key: string, fn: () => Promise<string | null | undefined>) => {
    if (!cache.has(key)) cache.set(key, (await fn().catch(() => null)) ?? null);
    return cache.get(key) ?? null;
  };

  if ((model === "Payment" || model === "PaymentMilestone") && typeof row.clientPlanId === "string") {
    const id = row.clientPlanId;
    return lookup(`ClientPlan:${id}`, async () =>
      (await db.clientPlan.findUnique({ where: { id }, select: { clientId: true } }))?.clientId,
    );
  }
  if ((model === "FitnessCheckIn" || model === "FitnessWorkoutDay") && typeof row.planId === "string") {
    const id = row.planId;
    return lookup(`FitnessPlan:${id}`, async () =>
      (await db.fitnessPlan.findUnique({ where: { id }, select: { clientId: true } }))?.clientId,
    );
  }
  if (model === "SkinPhoto" && typeof row.assessmentId === "string") {
    const id = row.assessmentId;
    return lookup(`Assessment:${id}`, async () =>
      (await db.assessment.findUnique({ where: { id }, select: { clientId: true } }))?.clientId,
    );
  }
  if (model === "FitnessExercise" && typeof row.dayId === "string") {
    const id = row.dayId;
    return lookup(`FitnessWorkoutDay:${id}`, async () =>
      (
        await db.fitnessWorkoutDay.findUnique({
          where: { id },
          select: { plan: { select: { clientId: true } } },
        })
      )?.plan.clientId,
    );
  }
  return null;
}

/** Resolve by id when only the entity reference is known (named domain events). */
export async function resolveClientIdById(db: Db, model: string, id: string): Promise<string | null> {
  if (model === "Client") return id;
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  const del = (db as unknown as Record<string, { findUnique?: (a: unknown) => Promise<Row | null> }>)[key];
  if (!del?.findUnique) return null;
  const row = await del.findUnique({ where: { id } }).catch(() => null);
  return row ? resolveClientId(db, model, row) : null;
}

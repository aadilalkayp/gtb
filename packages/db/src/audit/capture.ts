import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { deriveVerb, type FieldChanges, type WriteOp } from "@gtb/shared";
import { getAuditContext, type AuditContext } from "./context.js";

/**
 * Change capture (Team Pulse, TEAM_PULSE_DESIGN.md §5.2).
 *
 * A Prisma query extension on the base client, so every write is seen no
 * matter the path: the ZenStack gateway (enhance() wraps this client), the
 * privileged routes, the domain helpers and the cron job. Each write becomes a
 * field-level before/after diff pushed onto the request's audit context; the
 * API flushes the buffer to ActivityLog only when the request succeeds.
 *
 * Two constraints shaped this (verified in the Phase 1 spike):
 * - ZenStack narrows writes to `select: { id: true }` and runs them inside its
 *   own transaction, so the after-state cannot be re-read from outside. Instead
 *   the select is widened to every scalar for the same query, and the extra
 *   fields are stripped before the result goes back to the caller.
 * - ZenStack splits nested writes into separate top-level operations, so each
 *   entity is captured on its own. The base client's own nested writes are not
 *   expanded; the only two in the codebase target excluded models.
 */

/** System/pipeline/client-side models whose writes are noise in a staff audit trail. */
const EXCLUDED_MODELS = new Set([
  "ActivityLog",
  "StaffDay",
  "ActiveMinute",
  "AuthSession",
  "Notification",
  "OutboundMessage",
  "Scan",
  "ScanPhoto",
  "RoadmapItem",
  "CoachConversation",
  "CoachMessage",
  "LookPreview",
  "OutfitCheck",
  "ConversationRead",
]);

const CAPTURED_OPS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/** Fields never stored in a diff. */
const IGNORED_FIELD = /^(createdAt|updatedAt|authId)$|token|secret|password|embedding/i;
/** Rows recorded per bulk operation; the rest of a huge updateMany is not itemised. */
const MAX_ROWS_PER_OP = 200;
const MAX_STRING = 2000;
const MAX_JSON = 2048;

type Row = Record<string, unknown>;
type Args = Record<string, unknown> & {
  where?: unknown;
  data?: unknown;
  select?: Record<string, unknown>;
  omit?: Record<string, unknown>;
};

/** Scalar (incl. enum) field names per model, from Prisma's DMMF. */
const SCALARS = new Map<string, string[]>(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name,
    m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name),
  ]),
);

/**
 * Models whose `id` is a client-generated uuid (Prisma fills it in, not
 * Postgres). Prisma 7's runtime DMMF carries no default values, so this keys
 * on the schema convention instead: every `id String @id` is
 * `@default(uuid())`, except AuthSession (whose id is Supabase's, and which is
 * excluded from capture anyway).
 */
const UUID_ID_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.name !== "AuthSession")
    .filter((m) => m.fields.some((f) => f.name === "id" && f.kind === "scalar" && f.type === "String"))
    .map((m) => m.name),
);

function scalarsOf(model: string): string[] {
  return SCALARS.get(model) ?? [];
}

function delegate(client: PrismaClient, model: string) {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (client as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[key];
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

/** JSON-safe, size-bounded form of a field value for storage and comparison. */
export function normaliseValue(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toString();
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return "[binary]";
  if (typeof v === "string") return v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}…` : v;
  if (typeof v === "object") {
    const json = JSON.stringify(v);
    return json.length > MAX_JSON ? `[json, ${(json.length / 1024).toFixed(1)} KB]` : v;
  }
  return v;
}

export function diffRows(
  model: string,
  op: WriteOp,
  before: Row | null,
  after: Row | null,
  skip: ReadonlySet<string> = new Set(),
): FieldChanges {
  const changes: FieldChanges = {};
  for (const field of scalarsOf(model)) {
    if (IGNORED_FIELD.test(field) || skip.has(field)) continue;
    const b = normaliseValue(before?.[field]);
    const a = normaliseValue(after?.[field]);
    if (op === "create" && a === null) continue;
    if (op === "delete" && b === null) continue;
    if (op === "update" && JSON.stringify(a) === JSON.stringify(b)) continue;
    changes[field] = [b, a];
  }
  return changes;
}

function pickScalars(model: string, row: Row | null): Row {
  const out: Row = {};
  if (!row) return out;
  for (const f of scalarsOf(model)) if (f in row) out[f] = row[f];
  return out;
}

/**
 * Best-effort after-state for updateMany, which returns only a count: plain
 * assignments are applied; atomic operations (increment, ...) are marked.
 */
function applyData(model: string, before: Row, data: unknown): Row {
  const after: Row = { ...before };
  if (!data || typeof data !== "object") return after;
  const scalars = new Set(scalarsOf(model));
  for (const [k, v] of Object.entries(data as Row)) {
    if (!scalars.has(k)) continue;
    if (v instanceof Date || v === null || typeof v !== "object") after[k] = v;
    else if ("set" in (v as Row)) after[k] = (v as Row).set;
    else after[k] = "[changed]";
  }
  return after;
}

// ---------------------------------------------------------------------------
// Select widening
// ---------------------------------------------------------------------------

function widen(model: string, args: Args): { args: Args; added: string[] } {
  if (!args?.select) return { args, added: [] }; // no select / include: all scalars come back
  const added = scalarsOf(model).filter((f) => !(f in args.select!));
  if (added.length === 0) return { args, added };
  return {
    args: { ...args, select: { ...args.select, ...Object.fromEntries(added.map((f) => [f, true])) } },
    added,
  };
}

function strip(result: unknown, added: string[]): void {
  if (added.length === 0 || !result || typeof result !== "object") return;
  const rows = Array.isArray(result) ? result : [result];
  for (const r of rows) for (const f of added) delete (r as Row)[f];
}

/** Fields the caller omitted are absent from the result, not changed. */
function omitted(args: Args): Set<string> {
  return new Set(args?.omit ? Object.keys(args.omit).filter((k) => args.omit![k]) : []);
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

function record(
  ctx: AuditContext,
  model: string,
  op: WriteOp,
  before: Row | null,
  after: Row | null,
  skip?: ReadonlySet<string>,
): void {
  const changes = diffRows(model, op, before, after, skip);
  if (op === "update" && Object.keys(changes).length === 0) return; // no-op writes (e.g. lost guards)
  const row = pickScalars(model, after ?? before);
  ctx.pending.push({
    at: new Date(),
    model,
    entityId: typeof row.id === "string" ? row.id : String(row.id ?? ""),
    op,
    verb: deriveVerb(model, op, changes),
    changes,
    row,
  });
}

function warn(msg: string, error: unknown): void {
  // @gtb/db has no logger dependency; the API's structured logger picks up stderr.
  console.error(JSON.stringify({ level: "warn", mod: "audit", msg, error: String(error) }));
}

/** Read helper that never throws: capture must not break the write it observes. */
async function safeRead<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    warn("before-state read failed", error);
    return fallback;
  }
}

/**
 * Wrap the base Prisma client with change capture. `raw` (the unextended
 * client) is used for before-state reads so capture never recurses.
 */
export function withAuditCapture(raw: PrismaClient) {
  return raw.$extends({
    name: "team-pulse-audit",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ctx = getAuditContext();
          if (!ctx || !model || EXCLUDED_MODELS.has(model) || !CAPTURED_OPS.has(operation)) {
            return query(args);
          }
          const a = (args ?? {}) as Args;
          // The extension is model-generic; per-model arg types do not apply here.
          const run = (x: Args) => query(x as never);
          const read = delegate(raw, model);
          const selectAll = Object.fromEntries(scalarsOf(model).map((f) => [f, true]));
          const skip = omitted(a);

          switch (operation) {
            case "create":
            case "createManyAndReturn": {
              const w = widen(model, a);
              const result = await run(w.args);
              const rows = (Array.isArray(result) ? result : [result]) as Row[];
              for (const r of rows.slice(0, MAX_ROWS_PER_OP)) record(ctx, model, "create", null, r, skip);
              strip(result, w.added);
              return result;
            }
            case "createMany": {
              // createMany returns only a count. For uuid-keyed models, assign the
              // ids here (exactly what Prisma's @default(uuid()) would do) so each
              // created row is recorded under its real id.
              let data = (Array.isArray(a.data) ? a.data : [a.data]) as Row[];
              if (UUID_ID_MODELS.has(model)) data = data.map((d) => (d.id ? d : { ...d, id: randomUUID() }));
              const result = await run({ ...a, data });
              for (const d of data.slice(0, MAX_ROWS_PER_OP)) record(ctx, model, "create", null, d);
              return result;
            }
            case "update":
            case "upsert": {
              const before = (await safeRead(
                () => read!.findUnique!({ where: a.where, select: selectAll }),
                null,
              )) as Row | null;
              const w = widen(model, a);
              const result = await run(w.args);
              const op = operation === "upsert" && !before ? "create" : "update";
              record(ctx, model, op, before, result as Row, skip);
              strip(result, w.added);
              return result;
            }
            case "delete": {
              const w = widen(model, a);
              const result = await run(w.args);
              record(ctx, model, "delete", result as Row, null, skip);
              strip(result, w.added);
              return result;
            }
            case "updateMany":
            case "updateManyAndReturn": {
              const before = (await safeRead(
                () => read!.findMany!({ where: a.where, select: selectAll, take: MAX_ROWS_PER_OP }),
                [],
              )) as Row[];
              const w = operation === "updateManyAndReturn" ? widen(model, a) : { args: a, added: [] };
              const result = await run(w.args);
              if (operation === "updateMany") {
                if ((result as { count: number }).count > 0) {
                  for (const b of before) record(ctx, model, "update", b, applyData(model, b, a.data));
                }
              } else {
                const byId = new Map(before.map((b) => [b.id, b]));
                for (const r of (result as Row[]).slice(0, MAX_ROWS_PER_OP)) {
                  record(ctx, model, "update", byId.get(r.id) ?? null, r, skip);
                }
                strip(result, w.added);
              }
              return result;
            }
            case "deleteMany": {
              const before = (await safeRead(
                () => read!.findMany!({ where: a.where, select: selectAll, take: MAX_ROWS_PER_OP }),
                [],
              )) as Row[];
              const result = await run(a);
              if ((result as { count: number }).count > 0) {
                for (const b of before) record(ctx, model, "delete", b, null);
              }
              return result;
            }
          }
          return query(args);
        },
      },
    },
  });
}

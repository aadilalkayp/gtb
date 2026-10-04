import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "@prisma/client";
import type { FieldChanges, WriteOp } from "@gtb/shared";

/**
 * Per-request audit context (Team Pulse, TEAM_PULSE_DESIGN.md §5.1).
 *
 * The API's `withRequestLog` opens one around every route handler; auth fills
 * in the actor. The Prisma capture extension reads it to stamp writes with who
 * made them, and buffers them in `pending` until the request succeeds.
 *
 * No context (seed scripts, tests, one-off tooling) means no capture.
 */
export interface AuditActor {
  id: string;
  role: Role;
}

/** A captured write, not yet persisted. */
export interface PendingChange {
  at: Date;
  model: string;
  entityId: string;
  op: WriteOp;
  verb: string;
  changes: FieldChanges;
  /** Scalars of the row (after-state, or before-state for deletes) for client resolution. */
  row: Record<string, unknown>;
}

export interface AuditContext {
  requestId: string;
  source: "request" | "cron";
  actor?: AuditActor;
  ip?: string;
  userAgent?: string;
  pending: PendingChange[];
  /** Request-scoped memo (e.g. the resolved auth user, so Supabase is asked once). */
  memo: Map<string, unknown>;
}

// One store per process, pinned on globalThis like the Prisma client. Next can
// evaluate this package more than once (instrumentation and each route bundle);
// with a module-level store, the cached Prisma client's capture extension would
// read a different store from the one the request handler filled, and silently
// capture nothing.
const globalForAudit = globalThis as unknown as { gtbAuditStorage?: AsyncLocalStorage<AuditContext> };
const storage = (globalForAudit.gtbAuditStorage ??= new AsyncLocalStorage<AuditContext>());

export function createAuditContext(
  init: Pick<AuditContext, "requestId" | "source"> & Partial<Pick<AuditContext, "ip" | "userAgent">>,
): AuditContext {
  return { ...init, pending: [], memo: new Map() };
}

export function runWithAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}

/** Called by auth once the caller is known. */
export function setAuditActor(actor: AuditActor | undefined): void {
  const ctx = storage.getStore();
  if (ctx) ctx.actor = actor;
}

/**
 * Staff whose presence and activity Team Pulse tracks: every staff role except
 * founders (audit only) and clients (not staff).
 */
export function isTrackedRole(role: Role | undefined | null): boolean {
  return role != null && role !== "founder" && role !== "client";
}

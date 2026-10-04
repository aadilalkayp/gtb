import { randomUUID } from "node:crypto";
import { Prisma, type ActivityKind, type Role } from "@prisma/client";
import { workDayKey, type ActivityModule } from "@gtb/shared";
import { rawPrisma } from "../client.js";
import { getAuditContext, isTrackedRole } from "../audit/context.js";

/**
 * Team Pulse presence (TEAM_PULSE_DESIGN.md §4.2, §4.3, §5.5).
 *
 * Only activity a person caused counts: heartbeats (sent by the browser only
 * after real input), write requests, sign-ins and view/export events. Reads are
 * deliberately ignored, because React Query refetches on reconnect and the
 * notification bell polls every minute; either would make an idle open tab look
 * like a working day.
 *
 * Founders and clients are never tracked (`isTrackedRole`).
 */

/** Minute-level presence is kept 6 months; daily totals forever. */
export const ACTIVE_MINUTE_RETENTION_DAYS = 183;
/** Same staff member + same client within this window = one profile view. */
const VIEW_DEDUPE_MS = 30 * 60_000;
/** StaffDay first/last-seen writes per user are throttled to this (counts are never dropped). */
const TOUCH_THROTTLE_MS = 60_000;

// Raw SQL timestamps are passed as ISO strings and cast in the query with
// `::timestamptz AT TIME ZONE 'UTC'`: the columns are Prisma's timestamp(3)
// holding UTC, and this keeps the value independent of the session time zone.
// (A nested Prisma.sql fragment would read better, but under Next's bundler it
// is serialised as a plain value instead of being spliced into the query.)

const lastTouch = new Map<string, { day: string; at: number }>();

export interface PresenceCounts {
  activeMinutes?: number;
  changes?: number;
  views?: number;
}

/**
 * Extend the staff member's work day to include `at`, and add any counts.
 * Upserts StaffDay; first/last-only touches are throttled per user.
 */
export async function touchPresence(userId: string, at: Date = new Date(), counts: PresenceCounts = {}): Promise<void> {
  const day = workDayKey(at);
  const am = counts.activeMinutes ?? 0;
  const cc = counts.changes ?? 0;
  const vc = counts.views ?? 0;
  const prev = lastTouch.get(userId);
  if (am === 0 && cc === 0 && vc === 0 && prev && prev.day === day && at.getTime() - prev.at < TOUCH_THROTTLE_MS) {
    return;
  }
  lastTouch.set(userId, { day, at: at.getTime() });
  await rawPrisma.$executeRaw`
    INSERT INTO "StaffDay" ("id", "userId", "day", "firstSeenAt", "lastSeenAt", "activeMinutes", "changeCount", "viewCount")
    VALUES (${randomUUID()}, ${userId}, ${day}::date,
            (${at.toISOString()}::timestamptz AT TIME ZONE 'UTC'),
            (${at.toISOString()}::timestamptz AT TIME ZONE 'UTC'),
            ${am}, ${cc}, ${vc})
    ON CONFLICT ("userId", "day") DO UPDATE SET
      "firstSeenAt"   = LEAST("StaffDay"."firstSeenAt", EXCLUDED."firstSeenAt"),
      "lastSeenAt"    = GREATEST("StaffDay"."lastSeenAt", EXCLUDED."lastSeenAt"),
      "activeMinutes" = "StaffDay"."activeMinutes" + EXCLUDED."activeMinutes",
      "changeCount"   = "StaffDay"."changeCount" + EXCLUDED."changeCount",
      "viewCount"     = "StaffDay"."viewCount" + EXCLUDED."viewCount"`;
}

/**
 * One heartbeat = this minute was active. The (userId, minute) key makes
 * several tabs, retries and early pings idempotent; only a newly inserted
 * minute adds to the day's active total. Uses the server clock.
 */
export async function recordHeartbeat(userId: string, module: ActivityModule, at: Date = new Date()): Promise<boolean> {
  const minute = new Date(Math.floor(at.getTime() / 60_000) * 60_000);
  const inserted = await rawPrisma.$executeRaw`
    INSERT INTO "ActiveMinute" ("userId", "minute", "module")
    VALUES (${userId}, (${minute.toISOString()}::timestamptz AT TIME ZONE 'UTC'), ${module})
    ON CONFLICT DO NOTHING`;
  await touchPresence(userId, at, { activeMinutes: inserted > 0 ? 1 : 0 });
  return inserted > 0;
}

// ---------------------------------------------------------------------------
// Sign-ins
// ---------------------------------------------------------------------------

const knownSessions = new Set<string>();

/**
 * Supabase keeps one `session_id` across token refreshes for the life of a
 * sign-in, so the first request carrying a new id is a real sign-in (password
 * or magic link). Recorded once, with device and IP.
 */
export async function recordSignIn(input: {
  userId: string;
  role: Role;
  sessionId: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  if (!isTrackedRole(input.role) || knownSessions.has(input.sessionId)) return;
  if (knownSessions.size > 10_000) knownSessions.clear();
  knownSessions.add(input.sessionId);

  const inserted = await rawPrisma.$executeRaw`
    INSERT INTO "AuthSession" ("id", "userId", "firstSeenAt", "ip", "userAgent")
    VALUES (${input.sessionId}, ${input.userId}, (${new Date().toISOString()}::timestamptz AT TIME ZONE 'UTC'),
            ${input.ip ?? null}, ${input.userAgent ?? null})
    ON CONFLICT DO NOTHING`;
  if (inserted === 0) return; // seen before this process started

  await writeEvent({
    actor: { id: input.userId, role: input.role },
    verb: "auth.signed_in",
    kind: "auth",
    entityType: "User",
    entityId: input.userId,
    meta: { ip: input.ip ?? null, userAgent: input.userAgent ?? null },
  });
  await touchPresence(input.userId);
}

// ---------------------------------------------------------------------------
// Views, exports, sign-outs
// ---------------------------------------------------------------------------

export interface ActivityEventInput {
  actor: { id: string; role: Role };
  verb: string;
  kind: ActivityKind;
  entityType: string;
  entityId: string;
  clientId?: string | null;
  module?: ActivityModule | null;
  summary?: string | null;
  meta?: Record<string, unknown>;
}

async function writeEvent(e: ActivityEventInput, db: Prisma.TransactionClient = rawPrisma): Promise<void> {
  const ctx = getAuditContext();
  await db.activityLog.create({
    data: {
      entityType: e.entityType,
      entityId: e.entityId,
      action: "created",
      verb: e.verb,
      kind: e.kind,
      module: e.module ?? null,
      performedById: e.actor.id,
      actorRole: e.actor.role,
      source: ctx?.source ?? "request",
      requestId: ctx?.requestId ?? null,
      clientId: e.clientId ?? null,
      summary: e.summary ?? null,
      meta: e.meta ? (e.meta as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}

/**
 * Record a non-write activity (client profile opened, document downloaded,
 * report exported, signed out) for a tracked staff member. Repeat views of the
 * same entity within 30 minutes collapse into one. Returns whether it was
 * recorded.
 */
export async function recordActivityEvent(e: ActivityEventInput): Promise<boolean> {
  if (!isTrackedRole(e.actor.role)) return false;
  const now = Date.now();
  // Dedupe against the table, not process memory (it must hold across
  // restarts and module re-evaluation), under a per-person-per-entity advisory
  // lock: two near-simultaneous opens (React StrictMode runs effects twice)
  // would otherwise both pass the check before either inserts.
  if (e.kind === "view") {
    const key = `view:${e.actor.id}:${e.verb}:${e.entityId}`;
    return rawPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const recent = await tx.activityLog.findFirst({
        where: {
          performedById: e.actor.id,
          createdAt: { gte: new Date(now - VIEW_DEDUPE_MS) },
          verb: e.verb,
          entityId: e.entityId,
        },
        select: { id: true },
      });
      if (recent) return false;
      await writeEvent(e, tx);
      await touchPresence(e.actor.id, new Date(now), { views: 1 });
      return true;
    });
  }
  await writeEvent(e);
  await touchPresence(e.actor.id, new Date(now));
  return true;
}

/**
 * Write an audit event for any actor, with no presence side effects (e.g. a
 * founder exporting a Team Pulse report: founders are audited, not tracked).
 */
export async function recordAuditEvent(e: ActivityEventInput): Promise<void> {
  await writeEvent(e);
}

/** Daily retention: drop minute-level presence older than 6 months. */
export async function pruneActiveMinutes(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ACTIVE_MINUTE_RETENTION_DAYS * 24 * 60 * 60_000);
  const { count } = await rawPrisma.activeMinute.deleteMany({ where: { minute: { lt: cutoff } } });
  return count;
}

/** Test hook: forget in-memory throttles and caches. */
export function resetPresenceMemory(): void {
  lastTouch.clear();
  knownSessions.clear();
}

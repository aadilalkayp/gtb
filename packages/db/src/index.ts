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
import { Prisma } from "@prisma/client";
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

import { prisma, rawPrisma } from "./client.js";
import { flushAudit } from "./audit/flush.js";
import type { AuditContext } from "./audit/context.js";

export { prisma };

/** Persist a request's captured changes (see audit/flush.ts). */
export function flushRequestAudit(ctx: AuditContext): Promise<number> {
  return flushAudit(rawPrisma, ctx);
}

export {
  createAuditContext,
  runWithAuditContext,
  getAuditContext,
  setAuditActor,
  isTrackedRole,
  type AuditContext,
  type AuditActor,
} from "./audit/context.js";

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

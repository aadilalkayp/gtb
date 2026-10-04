import { getAuditContext, prisma, setAuditActor, type AuthUser } from "@gtb/db";
import { recordSignIn } from "@gtb/db/server";
import { supabaseAnon } from "./supabase.js";
import { addRequestLogContext, logger, requestLog } from "./logger.js";

/**
 * Resolve the GTB OS user for an incoming request.
 *
 * Flow:
 *   1. Extract the bearer token and validate it with Supabase (getUser).
 *   2. Find our User row by authId (the Supabase uid).
 *   3. First-login linking: if no row matches authId but a User exists with the
 *      same email and no authId yet (created at staff onboarding / client
 *      invite), link them by stamping authId.
 *
 * Returns `undefined` for anonymous / unprovisioned / deactivated callers, so
 * ZenStack policies fail closed.
 */
const log = logger.child({ mod: "auth" });

export async function resolveAuthUser(req: Request): Promise<AuthUser | undefined> {
  // Once per request: the gateway resolves the caller twice (getPrisma + its
  // own check), and each resolution is a Supabase round trip.
  const ctx = getAuditContext();
  const memo = ctx?.memo.get(AUTH_MEMO) as Promise<AuthUser | undefined> | undefined;
  if (memo) return memo;
  const pending = resolveUncached(req);
  ctx?.memo.set(AUTH_MEMO, pending);
  return pending;
}

const AUTH_MEMO = "authUser";

async function resolveUncached(req: Request): Promise<AuthUser | undefined> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    // Debug, not warn: every unauthenticated probe hits this and the access
    // line already records the 401.
    requestLog(req).debug("no bearer token");
    return undefined;
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data.user) {
    requestLog(req).warn("supabase getUser rejected token", { reason: error?.message ?? "no user" });
    return undefined;
  }

  const authId = data.user.id;
  const email = data.user.email?.toLowerCase();

  // 1. Match by Supabase uid.
  let user = await prisma.user.findUnique({
    where: { authId },
    select: { id: true, role: true, isActive: true },
  });

  // 2. Link a pre-provisioned account by email on first login. Requires the
  // Supabase identity to have a CONFIRMED email (SEC-7): an attacker who
  // registered the invitee's email with public sign-up must first prove
  // ownership of that inbox before they can claim the pre-provisioned row.
  if (!user && email) {
    const pending = await prisma.user.findFirst({
      where: { email, authId: null },
      select: { id: true },
    });
    if (pending) {
      if (!data.user.email_confirmed_at) {
        log.warn("refusing to link unconfirmed email to pre-provisioned user", {
          email,
          userId: pending.id,
        });
      } else {
        user = await prisma.user.update({
          where: { id: pending.id },
          data: { authId },
          select: { id: true, role: true, isActive: true },
        });
        log.info("linked pre-provisioned user to auth identity", { email, userId: user.id, authId });
      }
    }
  }

  if (!user) {
    requestLog(req).warn("no user row for auth identity", { authId, email });
    return undefined;
  }
  if (!user.isActive) {
    requestLog(req).warn("deactivated user rejected", { userId: user.id, role: user.role });
    return undefined;
  }

  // Stamp the caller onto the request's access log line and audit context.
  addRequestLogContext(req, { userId: user.id, role: user.role });
  setAuditActor({ id: user.id, role: user.role });

  // Team Pulse: a Supabase session id seen for the first time is a sign-in.
  const sessionId = jwtSessionId(token);
  if (sessionId) {
    const audit = getAuditContext();
    await recordSignIn({
      userId: user.id,
      role: user.role,
      sessionId,
      ip: audit?.ip,
      userAgent: audit?.userAgent,
    }).catch((error) => log.error("sign-in record failed", { error, userId: user.id }));
  }
  return { id: user.id, role: user.role };
}

/**
 * The `session_id` claim of an access token Supabase has ALREADY validated
 * (getUser above). It stays the same across refreshes for one sign-in.
 */
function jwtSessionId(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.session_id === "string" ? payload.session_id : undefined;
  } catch {
    return undefined;
  }
}

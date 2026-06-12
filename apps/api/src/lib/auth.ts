import { prisma, type AuthUser } from "@gtb/db";
import { supabaseAnon } from "./supabase.js";

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
export async function resolveAuthUser(req: Request): Promise<AuthUser | undefined> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    console.warn("[auth] no bearer token");
    return undefined;
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data.user) {
    console.warn("[auth] supabase getUser failed:", error?.message ?? "no user");
    return undefined;
  }

  const authId = data.user.id;
  const email = data.user.email?.toLowerCase();

  // 1. Match by Supabase uid.
  let user = await prisma.user.findUnique({
    where: { authId },
    select: { id: true, role: true, isActive: true },
  });

  // 2. Link a pre-provisioned account by email on first login.
  if (!user && email) {
    const pending = await prisma.user.findFirst({
      where: { email, authId: null },
      select: { id: true },
    });
    if (pending) {
      user = await prisma.user.update({
        where: { id: pending.id },
        data: { authId },
        select: { id: true, role: true, isActive: true },
      });
      console.info(`[auth] linked email=${email} to authId=${authId}`);
    }
  }

  if (!user) {
    console.warn(`[auth] no user row for authId=${authId} email=${email}`);
    return undefined;
  }
  if (!user.isActive) {
    console.warn(`[auth] user ${user.id} (${user.role}) is deactivated`);
    return undefined;
  }

  return { id: user.id, role: user.role };
}

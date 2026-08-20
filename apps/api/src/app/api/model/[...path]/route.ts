import { NextRequestHandler } from "@zenstackhq/server/next";
import type { NextRequest } from "next/server";
import { getEnhancedPrisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions, withCors } from "@/lib/cors";

/**
 * ZenStack auto-CRUD endpoint. Every model is exposed here as an RPC-style API
 * (findMany, create, update, ...). Access policies in the schema are enforced
 * because we hand ZenStack a client enhanced with the caller's identity.
 */
const zenHandler = NextRequestHandler({
  useAppDir: true,
  getPrisma: async (req) => getEnhancedPrisma(await resolveAuthUser(req)),
  logger: {
    error: (msg, code) => console.error(`[ZenStack] ${code ?? ""} ${msg}`),
    warn: (msg) => console.warn(`[ZenStack] ${msg}`),
    info: (msg) => console.info(`[ZenStack] ${msg}`),
  },
});

type Ctx = { params: Promise<{ path: string[] }> };

// ZenStack applies field-level READ policies to find* results but not to
// groupBy/aggregate output (verified against @zenstackhq/server 2.22) — a
// client could `groupBy` User.email/phone and reconstruct the staff directory
// that SEC-11 hides. Block the aggregation verbs on any model that carries
// field-level read denies.
const FIELD_READ_PROTECTED_MODELS = new Set(["user"]);
const AGGREGATION_OPS = new Set(["groupBy", "aggregate"]);

async function handler(req: NextRequest, ctx: Ctx): Promise<Response> {
  const path = req.nextUrl.pathname;
  const user = await resolveAuthUser(req);
  if (!user) {
    console.warn(`[model] ${req.method} ${path} — no auth user resolved`);
  }

  const { path: segments } = await ctx.params;
  const [model, op] = [segments[0]?.toLowerCase(), segments[1]];
  if (model && op && FIELD_READ_PROTECTED_MODELS.has(model) && AGGREGATION_OPS.has(op)) {
    return withCors(
      req,
      Response.json({ error: `Operation ${op} is not available on ${model}` }, { status: 403 }),
    );
  }

  const res = await zenHandler(req, ctx);

  if (res.status >= 400) {
    const body = await res.clone().text();
    console.error(
      `[model] ${req.method} ${path} ${res.status}`,
      user ? `user=${user.id} role=${user.role}` : "anonymous",
      body,
    );
  }

  return withCors(req, res);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = (req: NextRequest) => handleOptions(req);

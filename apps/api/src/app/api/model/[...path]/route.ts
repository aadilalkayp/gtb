import { NextRequestHandler } from "@zenstackhq/server/next";
import type { NextRequest } from "next/server";
import { getEnhancedPrisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions, withCors } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { logger, requestLog } from "@/lib/logger";

/**
 * ZenStack auto-CRUD endpoint. Every model is exposed here as an RPC-style API
 * (findMany, create, update, ...). Access policies in the schema are enforced
 * because we hand ZenStack a client enhanced with the caller's identity.
 */
const zenLog = logger.child({ mod: "zenstack" });

const zenHandler = NextRequestHandler({
  useAppDir: true,
  getPrisma: async (req) => getEnhancedPrisma(await resolveAuthUser(req)),
  logger: {
    error: (msg, code) => zenLog.error(msg, { code }),
    warn: (msg) => zenLog.warn(msg),
    info: (msg) => zenLog.info(msg),
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
    requestLog(req).debug("no auth user resolved", { path });
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

  // The access line records method/path/status; add the ZenStack error body,
  // which is the only place the policy-denial reason surfaces.
  if (res.status >= 400) {
    requestLog(req).warn("model request rejected", { body: await res.clone().text() });
  }

  return withCors(req, res);
}

const wrapped = withRequestLog(handler);
export const GET = wrapped;
export const POST = wrapped;
export const PUT = wrapped;
export const PATCH = wrapped;
export const DELETE = wrapped;
export const OPTIONS = (req: NextRequest) => handleOptions(req);

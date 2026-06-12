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

async function handler(req: NextRequest, ctx: Ctx): Promise<Response> {
  const path = req.nextUrl.pathname;
  const user = await resolveAuthUser(req);
  if (!user) {
    console.warn(`[model] ${req.method} ${path} — no auth user resolved`);
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

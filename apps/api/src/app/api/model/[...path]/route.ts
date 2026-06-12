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
});

type Ctx = { params: Promise<{ path: string[] }> };

async function handler(req: NextRequest, ctx: Ctx): Promise<Response> {
  const res = await zenHandler(req, ctx);
  return withCors(req, res);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = (req: NextRequest) => handleOptions(req);

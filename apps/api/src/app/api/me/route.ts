import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Returns the authenticated user's profile (with client info if applicable). */
async function handleGet(req: NextRequest): Promise<Response> {
  const authUser = await resolveAuthUser(req);
  if (!authUser) {
    return Response.json({ user: null }, { status: 401, headers: corsHeaders(req) });
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      avatarUrl: true,
      client: {
        select: { id: true, clientCode: true, type: true, status: true, leadPhase: true },
      },
    },
  });

  return Response.json({ user }, { headers: corsHeaders(req) });
}

export const GET = withRequestLog(handleGet);

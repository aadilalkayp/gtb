import type { NextRequest } from "next/server";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

export function GET(req: NextRequest): Response {
  return Response.json(
    { status: "ok", service: "gtb-os-api", time: new Date().toISOString() },
    { headers: corsHeaders(req) },
  );
}

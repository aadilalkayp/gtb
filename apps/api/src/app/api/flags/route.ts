import type { NextRequest } from "next/server";
import { featureFlags } from "@/lib/flags";
import { corsHeaders, handleOptions } from "@/lib/cors";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Public feature-flag snapshot the web app reads to show/hide features.
 *  Contains nothing sensitive — only which features are live. */
export function GET(req: NextRequest): Response {
  return Response.json({ flags: featureFlags }, { headers: corsHeaders(req) });
}

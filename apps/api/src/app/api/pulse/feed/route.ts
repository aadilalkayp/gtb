import type { NextRequest } from "next/server";
import { pulseFeed, type PulseFeedFilters } from "@gtb/db/server";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { parseDay, pulseJson, requireFounder } from "@/lib/pulse";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const KINDS = new Set(["change", "view", "export", "auth"]);

/**
 * The activity log (founders only): one staff member (`userId`), one client
 * (`clientId`), or the whole team. Newest first, keyset-paginated (`cursor`).
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const { error } = await requireFounder(req);
  if (error) return error;
  const p = req.nextUrl.searchParams;
  const from = p.get("from") ? parseDay(p.get("from"), "") : undefined;
  const to = p.get("to") ? parseDay(p.get("to"), "") : undefined;
  if (from === null || to === null) return pulseJson(req, { error: "Dates must be YYYY-MM-DD" }, 400);

  const filters: PulseFeedFilters = {
    userId: p.get("userId") || undefined,
    clientId: p.get("clientId") || undefined,
    kinds: (p.get("kinds") ?? "").split(",").filter((k) => KINDS.has(k)) as PulseFeedFilters["kinds"],
    module: p.get("module") || undefined,
    q: p.get("q")?.slice(0, 100) || undefined,
    from,
    to,
    includeFounders: p.get("includeFounders") === "1",
    cursor: p.get("cursor") || undefined,
    limit: Math.min(Number(p.get("limit")) || 100, 200),
  };
  return pulseJson(req, await pulseFeed(filters));
}

export const GET = withRequestLog(handleGet);

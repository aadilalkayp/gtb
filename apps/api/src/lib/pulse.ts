import type { NextRequest } from "next/server";
import type { AuthUser } from "@gtb/db";
import { workDayKey, workDayRange } from "@gtb/shared";
import { resolveAuthUser } from "./auth.js";
import { corsHeaders } from "./cors.js";

/**
 * Shared plumbing for the founder-only Team Pulse routes (/api/pulse/*).
 * Every route starts with `requireFounder`: the data is invisible to all other
 * roles, including ops head (TEAM_PULSE_DESIGN.md §3, §10).
 */

export function pulseJson(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...corsHeaders(req), "cache-control": "no-store" } });
}

export async function requireFounder(
  req: NextRequest,
): Promise<{ founder: AuthUser; error?: undefined } | { founder?: undefined; error: Response }> {
  const user = await resolveAuthUser(req);
  if (!user) return { error: pulseJson(req, { error: "Unauthorized" }, 401) };
  if (user.role !== "founder") return { error: pulseJson(req, { error: "Forbidden" }, 403) };
  return { founder: user };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Longest range any Pulse view or report covers. */
export const MAX_RANGE_DAYS = 366;

export function parseDay(value: string | null, fallback: string): string | null {
  if (!value) return fallback;
  return DAY_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null;
}

/** `from`/`to` query params as work-day keys; defaults to the last 7 work days. */
export function parseRange(req: NextRequest): { from: string; to: string } | { error: string } {
  const today = workDayKey(new Date());
  const to = parseDay(req.nextUrl.searchParams.get("to"), today);
  const from = parseDay(req.nextUrl.searchParams.get("from"), to ?? today);
  if (!from || !to) return { error: "Dates must be YYYY-MM-DD" };
  if (from > to) return { error: "from must not be after to" };
  if (workDayRange(from, to).length > MAX_RANGE_DAYS) return { error: `Range is limited to ${MAX_RANGE_DAYS} days` };
  return { from, to };
}

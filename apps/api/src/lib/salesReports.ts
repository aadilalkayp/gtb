import type { NextRequest } from "next/server";
import type { AuthUser } from "@gtb/db";
import { resolveAuthUser } from "./auth.js";
import { pulseJson } from "./pulse.js";

/**
 * Guards for /api/sales-reports/* (SALES_REPORTS_DESIGN.md §8, §11). The team
 * view reuses Team Pulse's founder-only guard; a CRO only ever reaches their
 * own reports, and the CRO is always the caller, never a request field.
 */

export async function requireCro(
  req: NextRequest,
): Promise<{ cro: AuthUser; error?: undefined } | { cro?: undefined; error: Response }> {
  const user = await resolveAuthUser(req);
  if (!user) return { error: pulseJson(req, { error: "Unauthorized" }, 401) };
  if (user.role !== "cro" || user.isActive === false) return { error: pulseJson(req, { error: "Forbidden" }, 403) };
  return { cro: user };
}

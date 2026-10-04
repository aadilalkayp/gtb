import type { NextRequest } from "next/server";
import { pulseStaff } from "@gtb/db/server";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { parseRange, pulseJson, requireFounder } from "@/lib/pulse";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

type Ctx = { params: Promise<{ id: string }> };

/** One staff member's summary, outputs, module time and days (founders only). */
async function handleGet(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { error } = await requireFounder(req);
  if (error) return error;
  const range = parseRange(req);
  if ("error" in range) return pulseJson(req, { error: range.error }, 400);
  const { id } = await ctx.params;
  const detail = await pulseStaff(id, range.from, range.to);
  if (!detail) return pulseJson(req, { error: "Staff member not found" }, 404);
  return pulseJson(req, detail);
}

export const GET = withRequestLog(handleGet);

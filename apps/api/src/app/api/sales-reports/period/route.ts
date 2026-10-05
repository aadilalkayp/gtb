import type { NextRequest } from "next/server";
import { salesReportPeriod } from "@gtb/db/server";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { parseRange, pulseJson, requireFounder } from "@/lib/pulse";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Sales reports over a range: per-CRO totals, submission record, trend, challenges (founders only). */
async function handleGet(req: NextRequest): Promise<Response> {
  const { error } = await requireFounder(req);
  if (error) return error;
  const range = parseRange(req);
  if ("error" in range) return pulseJson(req, { error: range.error }, 400);
  return pulseJson(req, await salesReportPeriod(range.from, range.to));
}

export const GET = withRequestLog(handleGet);

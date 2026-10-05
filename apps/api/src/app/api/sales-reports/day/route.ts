import type { NextRequest } from "next/server";
import { salesReportDay } from "@gtb/db/server";
import { workDayKey } from "@gtb/shared";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { parseDay, pulseJson, requireFounder } from "@/lib/pulse";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Sales reports for one work day: every CRO, reported vs recorded (founders only). */
async function handleGet(req: NextRequest): Promise<Response> {
  const { error } = await requireFounder(req);
  if (error) return error;
  const day = parseDay(req.nextUrl.searchParams.get("date"), workDayKey(new Date()));
  if (!day) return pulseJson(req, { error: "date must be YYYY-MM-DD" }, 400);
  return pulseJson(req, await salesReportDay(day));
}

export const GET = withRequestLog(handleGet);

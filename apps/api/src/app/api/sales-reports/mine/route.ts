import type { NextRequest } from "next/server";
import {
  addFigures,
  computeSalesFigures,
  emptyFigures,
  parseSalesReportInput,
  salesReportGrid,
  salesReportWindow,
  saveSalesReport,
  SalesReportError,
} from "@gtb/db/server";
import { addWorkDays } from "@gtb/shared";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { parseDay, pulseJson } from "@/lib/pulse";
import { requireCro } from "@/lib/salesReports";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Days of history the CRO's own page shows. */
const HISTORY_DAYS = 30;

/**
 * The calling CRO's own reports (SALES_REPORTS_DESIGN.md §8, §9): today's
 * state, yesterday's (late filing), what GTB OS recorded, and recent history.
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const { cro, error } = await requireCro(req);
  if (error) return error;
  const { today, yesterday } = salesReportWindow();
  const grid = await salesReportGrid({ from: addWorkDays(today, -(HISTORY_DAYS - 1)), to: today, croId: cro.id });
  // This IST month so far, same credit rule: powers the CRO dashboard's conversions tile.
  const { byCro } = await computeSalesFigures(`${today.slice(0, 8)}01`, today);
  const monthToDate = [...(byCro.get(cro.id)?.values() ?? [])].reduce(addFigures, emptyFigures());
  return pulseJson(req, { today, yesterday, days: grid.rows[0]?.days ?? [], monthToDate });
}

/** File or edit today's report, or file yesterday's late. Body: { day, ...fields } or { day, dayOff: true }. */
async function handlePut(req: NextRequest): Promise<Response> {
  const { cro, error } = await requireCro(req);
  if (error) return error;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return pulseJson(req, { error: "Invalid JSON body" }, 400);
  }
  const day = parseDay(typeof body.day === "string" ? body.day : null, "");
  if (!day) return pulseJson(req, { error: "day must be YYYY-MM-DD" }, 400);
  try {
    const input = parseSalesReportInput(body);
    await saveSalesReport({ croId: cro.id, day, input });
  } catch (e) {
    if (e instanceof SalesReportError) return pulseJson(req, { error: e.message }, e.status);
    throw e;
  }
  const grid = await salesReportGrid({ from: day, to: day, croId: cro.id });
  return pulseJson(req, { day: grid.rows[0]?.days[0] ?? null });
}

export const GET = withRequestLog(handleGet);
export const PUT = withRequestLog(handlePut);

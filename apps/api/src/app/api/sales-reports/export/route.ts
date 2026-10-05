import type { NextRequest } from "next/server";
import { recordAuditEvent, salesReportGrid } from "@gtb/db/server";
import { SALES_REPORT_STATUS_LABELS } from "@gtb/shared";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";
import { parseRange, pulseJson, requireFounder } from "@/lib/pulse";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

const istDateTime = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of every CRO's report per day for the range (founders only). Audited like other exports. */
async function handleGet(req: NextRequest): Promise<Response> {
  const { founder, error } = await requireFounder(req);
  if (error) return error;
  const range = parseRange(req);
  if ("error" in range) return pulseJson(req, { error: range.error }, 400);

  const grid = await salesReportGrid({ from: range.from, to: range.to });
  const header = [
    "Date",
    "CRO",
    "Status",
    "Enquiries handled",
    "Leads added in GTB OS",
    "Lead follow-ups done",
    "Follow-ups planned yesterday",
    "Hot leads",
    "Follow-ups planned for tomorrow",
    "Confirmed sales",
    "Sales value (INR)",
    "Sales with price pending",
    "Payments received (INR)",
    "Submitted at",
    "Challenges",
  ];
  const lines: string[] = [];
  for (const day of [...(grid.rows[0]?.days ?? [])].reverse().map((d) => d.day)) {
    for (const row of grid.rows) {
      const c = row.days.find((d) => d.day === day);
      if (!c || !c.status) continue;
      const r = c.report && !c.report.dayOff ? c.report : null;
      lines.push(
        [
          day,
          row.cro.name,
          SALES_REPORT_STATUS_LABELS[c.status],
          r?.enquiries ?? null,
          c.figures.leadsAdded,
          r?.leadFollowUps ?? null,
          c.plannedYesterday,
          r?.hotLeads ?? null,
          r?.plannedFollowUps ?? null,
          c.figures.sales,
          c.figures.salesValue,
          c.figures.pricePending,
          c.figures.paymentsReceived,
          c.report ? istDateTime.format(new Date(c.report.submittedAt)) : null,
          r?.challenges ?? null,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  await recordAuditEvent({
    actor: founder,
    verb: "report.exported",
    kind: "export",
    entityType: "SalesReport",
    entityId: `${range.from}..${range.to}`,
    module: "reports",
    meta: { report: "Sales daily reports", format: "csv", from: range.from, to: range.to, rows: lines.length },
  }).catch((e) => requestLog(req).error("sales report export not audited", { error: e }));

  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      ...corsHeaders(req),
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sales-reports-${range.from}-to-${range.to}.csv"`,
      "cache-control": "no-store",
    },
  });
}

export const GET = withRequestLog(handleGet);

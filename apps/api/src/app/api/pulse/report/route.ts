import type { NextRequest } from "next/server";
import { pulseFeed, pulseStaff, recordAuditEvent, type PulseFeedEntry } from "@gtb/db/server";
import { ACTIVITY_MODULE_LABELS, activitySentence, clientInitials, isActivityModule } from "@gtb/shared";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";
import { parseRange, pulseJson, requireFounder } from "@/lib/pulse";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Entries a single report can hold; a longer period is marked truncated. */
const REPORT_MAX_ENTRIES = 5000;

const istDate = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const istTime = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function hideClientNames(entries: PulseFeedEntry[]): PulseFeedEntry[] {
  return entries.map((e) => (e.client ? { ...e, client: { ...e.client, name: clientInitials(e.client.name) } } : e));
}

/**
 * Staff report for evaluation meetings (TEAM_PULSE_DESIGN.md §9), founders
 * only. `format=json` feeds the print view (saved as PDF from the browser);
 * `format=csv` downloads one row per activity. `hideClients=1` replaces client
 * names with initials in both. Each export is itself audited.
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const { founder, error } = await requireFounder(req);
  if (error) return error;
  const p = req.nextUrl.searchParams;
  const userId = p.get("userId");
  if (!userId) return pulseJson(req, { error: "userId is required" }, 400);
  const range = parseRange(req);
  if ("error" in range) return pulseJson(req, { error: range.error }, 400);
  const format = p.get("format") === "csv" ? "csv" : "json";
  const hideClients = p.get("hideClients") === "1";

  const detail = await pulseStaff(userId, range.from, range.to);
  if (!detail) return pulseJson(req, { error: "Staff member not found" }, 404);
  const feed = await pulseFeed({ userId, from: range.from, to: range.to, order: "asc", limit: REPORT_MAX_ENTRIES });
  const entries = hideClients ? hideClientNames(feed.entries) : feed.entries;

  await recordAuditEvent({
    actor: founder,
    verb: "report.exported",
    kind: "export",
    entityType: "User",
    entityId: userId,
    module: "reports",
    meta: {
      report: `Team Pulse report: ${detail.staff.name}`,
      format: format === "csv" ? "csv" : "pdf",
      from: range.from,
      to: range.to,
      hideClients,
      rows: entries.length,
    },
  }).catch((e) => requestLog(req).error("report export not audited", { error: e }));

  if (format === "json") {
    return pulseJson(req, {
      detail,
      entries,
      truncated: feed.nextCursor !== null,
      hideClients,
      generatedAt: new Date().toISOString(),
    });
  }

  const header = ["Date", "Time", "Activity", "Client", "Module", "Details"];
  const lines = entries.map((e) => {
    const at = new Date(e.at);
    const moduleLabel = e.module && isActivityModule(e.module) ? ACTIVITY_MODULE_LABELS[e.module] : "";
    const extra = e.details.length > 0 ? `${e.details.length} related change(s)` : "";
    return [
      istDate.format(at),
      istTime.format(at),
      activitySentence(e.description, e.client?.name ?? null),
      e.client?.name ?? "",
      moduleLabel,
      [e.description.detail, extra].filter(Boolean).join(" · "),
    ]
      .map(csvCell)
      .join(",");
  });
  const slug = detail.staff.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      ...corsHeaders(req),
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="team-pulse-${slug}-${range.from}-to-${range.to}.csv"`,
      "cache-control": "no-store",
    },
  });
}

export const GET = withRequestLog(handleGet);

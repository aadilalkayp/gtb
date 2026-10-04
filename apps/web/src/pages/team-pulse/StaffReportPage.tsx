import { useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import {
  activitySentence,
  formatClockMinutes,
  formatDurationMinutes,
  workDayKey,
} from "@gtb/shared";
import { Button, Spinner } from "@/components/ui";
import { QueryErrorState } from "@/components/QueryErrorState";
import { usePulseReport, type PulseMetric } from "./pulseApi";
import { dayLabel, moduleLabel, rangeLabel, timeLabel, roleLabel } from "./pulseUi";

/**
 * Printable staff report for evaluation meetings (TEAM_PULSE_DESIGN.md §9):
 * summary, day by day, full activity list. "Download PDF" opens this page and
 * the browser's print dialog (Save as PDF). Founders only; the fetch itself is
 * recorded as an export.
 */
export function StaffReportPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const hideClients = params.get("hideClients") === "1";
  const autoPrint = params.get("print") === "1";
  const { data, isLoading, isError, refetch } = usePulseReport(id, from, to, hideClients);
  const printed = useRef(false);

  useEffect(() => {
    if (!data || !autoPrint || printed.current) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [data, autoPrint]);

  useEffect(() => {
    if (data) document.title = `Team Pulse report · ${data.detail.staff.name} · ${from} to ${to}`;
  }, [data, from, to]);

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <QueryErrorState onRetry={() => void refetch()} />
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  const { detail, entries } = data;
  const s = detail.summary;
  const clock = (m: number | null) => (m === null ? "–" : formatClockMinutes(m));
  const actionsByDay = new Map<string, number>();
  for (const e of entries) {
    if (e.kind === "change" || e.kind === "export") {
      const day = workDayKey(new Date(e.at));
      actionsByDay.set(day, (actionsByDay.get(day) ?? 0) + 1);
    }
  }
  const days = [...detail.days].sort((a, b) => (a.day < b.day ? -1 : 1));

  return (
    <div className="report min-h-screen bg-background print:bg-white">
      <div className="no-print sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-6 py-3">
          <Link
            to={`/team-pulse/staff/${id}?from=${from}&to=${to}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print or save as PDF
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-[860px] bg-surface px-10 py-10 shadow-card print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">GTB OS · Team Pulse report</p>
            <h1 className="font-display mt-2 text-3xl font-semibold tracking-display">{detail.staff.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {roleLabel(detail.staff.role)} · {rangeLabel(detail.from, detail.to)}
            </p>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Generated {dayLabel(workDayKey(new Date(data.generatedAt)), { year: true })}
            <br />
            {data.hideClients && "Client names shown as initials"}
          </p>
        </header>

        <section className="mt-6">
          <h2 className="text-sm font-semibold">Summary</h2>
          <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
            {[
              ["Days active", String(s.daysActive)],
              ["Average start", clock(s.avgStart)],
              ["Average end", clock(s.avgEnd)],
              ["Total active time", formatDurationMinutes(s.totalActiveMinutes)],
              ["Active per day", s.daysActive ? formatDurationMinutes(s.avgActiveMinutesPerDay) : "–"],
              ["Actions", String(s.actions)],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface px-4 py-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-num mt-0.5 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-6">
            <ReportMetrics title="Output" metrics={detail.outputs} />
            <ReportMetrics title="Timeliness" metrics={detail.timeliness} empty="Nothing with a deadline was logged." />
          </div>
        </section>

        <section className="mt-8 break-inside-avoid-page">
          <h2 className="text-sm font-semibold">Day by day</h2>
          {days.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No working days recorded in this period.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Day</th>
                  <th className="py-2 pr-4 font-medium">First activity</th>
                  <th className="py-2 pr-4 font-medium">Last activity</th>
                  <th className="py-2 pr-4 font-medium">Active</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {days.map((d) => (
                  <tr key={d.day} className="break-inside-avoid">
                    <td className="py-2 pr-4">{dayLabel(d.day)}</td>
                    <td className="font-num py-2 pr-4">{timeLabel(d.firstSeenAt)}</td>
                    <td className="font-num py-2 pr-4">{timeLabel(d.lastSeenAt)}</td>
                    <td className="font-num py-2 pr-4">{formatDurationMinutes(d.activeMinutes)}</td>
                    <td className="font-num py-2">{actionsByDay.get(d.day) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold">Activity</h2>
          {data.truncated && (
            <p className="mt-1 text-xs text-warning">
              This period has more activity than one report holds; the list stops after {entries.length} entries.
            </p>
          )}
          {entries.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No activity recorded in this period.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="w-[92px] py-2 pr-3 font-medium">Day</th>
                  <th className="w-[70px] py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Activity</th>
                  <th className="w-[96px] py-2 font-medium">Module</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e, i) => {
                  const day = workDayKey(new Date(e.at));
                  const prevDay = i > 0 ? workDayKey(new Date(entries[i - 1]!.at)) : null;
                  return (
                    <tr key={e.id} className="break-inside-avoid align-top">
                      <td className="py-1.5 pr-3 text-xs text-muted-foreground">{day !== prevDay ? dayLabel(day) : ""}</td>
                      <td className="font-num py-1.5 pr-3 text-xs">{timeLabel(e.at)}</td>
                      <td className="py-1.5 pr-3">
                        {activitySentence(e.description, e.client?.name ?? null)}
                        {e.description.detail && (
                          <span className="block text-xs text-muted-foreground">{e.description.detail}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">{moduleLabel(e.module)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
          Times are IST. A work day runs from 4:00 am to 4:00 am. Active time counts minutes with real input in the app;
          work done outside the app (calls, sessions, shoots) is reflected in the output numbers, not in active time.
        </footer>
      </article>
    </div>
  );
}

function ReportMetrics({ title, metrics, empty }: { title: string; metrics: PulseMetric[]; empty?: string }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {metrics.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty ?? "–"}</p>
      ) : (
        <dl className="mt-2 divide-y divide-border text-sm">
          {metrics.map((m) => (
            <div key={m.key} className="flex justify-between gap-3 py-1.5">
              <dt>{m.label}</dt>
              <dd className="font-num text-right font-semibold">
                {m.value}
                {m.hint && <span className="ml-1.5 font-normal text-muted-foreground">{m.hint}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

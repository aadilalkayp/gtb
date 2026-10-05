import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList } from "lucide-react";
import {
  formatINR,
  SALES_REPORT_COUNT_FIELDS,
  SALES_REPORT_MAX_CHALLENGES,
  SALES_REPORT_MAX_COUNT,
  type SalesReportCountKey,
} from "@gtb/shared";
import { PageHeader } from "@/components/PageHeader";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Spinner, Textarea } from "@/components/ui";
import { dayLabel } from "../team-pulse/pulseUi";
import { useMySalesReports, useSaveSalesReport, type SalesDayCell } from "./salesApi";
import { FiguresList, SalesStatusBadge, salesLabel, submittedLabel } from "./salesUi";

type Counts = Record<SalesReportCountKey, string>;
const EMPTY: Counts = { enquiries: "", leadFollowUps: "", hotLeads: "", plannedFollowUps: "" };

function countsOf(cell: SalesDayCell | undefined): Counts {
  const r = cell?.report;
  if (!r || r.dayOff) return EMPTY;
  return {
    enquiries: String(r.enquiries ?? ""),
    leadFollowUps: String(r.leadFollowUps ?? ""),
    hotLeads: String(r.hotLeads ?? ""),
    plannedFollowUps: String(r.plannedFollowUps ?? ""),
  };
}

/** The CRO's end-of-day sales report (SALES_REPORTS_DESIGN.md §9). */
export function DailyReportPage() {
  const { data, isLoading, isError, refetch } = useMySalesReports();
  const [target, setTarget] = useState<"today" | "yesterday">("today");

  if (isError) return <div className="page"><QueryErrorState onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  const todayCell = data.days.find((d) => d.day === data.today);
  const yesterdayCell = data.days.find((d) => d.day === data.yesterday);
  const canFileLate = yesterdayCell?.status === "missed";
  const day = target === "yesterday" && canFileLate ? data.yesterday : data.today;
  const cell = day === data.today ? todayCell : yesterdayCell;

  return (
    <div className="page">
      <PageHeader
        title="Daily Report"
        subtitle="Your end-of-day sales report for the founders. You can edit today's report until 4:00 am."
      />

      {canFileLate && target === "today" && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Yesterday's report is missing. You can still file it; it will be marked late.
          </span>
          <Button size="sm" variant="outline" onClick={() => setTarget("yesterday")}>
            File yesterday's report
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <ReportForm
          key={day}
          day={day}
          isToday={day === data.today}
          cell={cell}
          onDone={() => setTarget("today")}
        />
        <Card>
          <CardHeader>
            <CardTitle>From GTB OS {day === data.today ? "today" : "yesterday"}</CardTitle>
          </CardHeader>
          <CardContent>
            {cell ? <FiguresList figures={cell.figures} /> : null}
            <p className="mt-4 text-xs text-muted-foreground">
              Filled in automatically. Sales and payments count for leads you created, or for your clients when the
              lead came from elsewhere.
            </p>
          </CardContent>
        </Card>
      </div>

      <History days={data.days} />
    </div>
  );
}

function ReportForm({
  day,
  isToday,
  cell,
  onDone,
}: {
  day: string;
  isToday: boolean;
  cell: SalesDayCell | undefined;
  onDone: () => void;
}) {
  const save = useSaveSalesReport();
  const report = cell?.report ?? null;
  const [counts, setCounts] = useState<Counts>(() => countsOf(cell));
  const [challenges, setChallenges] = useState(report?.challenges ?? "");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  // A report filed as a day off shows a summary until the CRO chooses to fill it in.
  const [editingDayOff, setEditingDayOff] = useState(false);

  useEffect(() => setSaved(false), [counts, challenges]);

  const invalid = useMemo(
    () =>
      SALES_REPORT_COUNT_FIELDS.filter((f) => {
        const v = counts[f.key].trim();
        return !/^\d+$/.test(v) || Number(v) > SALES_REPORT_MAX_COUNT;
      }).map((f) => f.key),
    [counts],
  );

  async function submit() {
    setError(undefined);
    if (invalid.length) {
      setError(`Enter a whole number from 0 to ${SALES_REPORT_MAX_COUNT} in every field.`);
      return;
    }
    try {
      await save.mutateAsync({
        day,
        enquiries: Number(counts.enquiries),
        leadFollowUps: Number(counts.leadFollowUps),
        hotLeads: Number(counts.hotLeads),
        plannedFollowUps: Number(counts.plannedFollowUps),
        challenges: challenges.trim() || null,
      });
      setSaved(true);
      setEditingDayOff(false);
      if (!isToday) onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the report");
    }
  }

  async function dayOff() {
    setError(undefined);
    try {
      await save.mutateAsync({ day, dayOff: true });
      setCounts(EMPTY);
      setChallenges("");
      if (!isToday) onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the report");
    }
  }

  const title = `${isToday ? "Today" : "Yesterday"}, ${dayLabel(day)}`;

  if (report?.dayOff && !editingDayOff) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <SalesStatusBadge status={cell?.status ?? null} />
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">You marked this as a day off.</p>
          {isToday && (
            <Button variant="outline" onClick={() => setEditingDayOff(true)}>
              Fill in a report instead
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="flex items-center gap-2">
          {!isToday && <span className="text-xs text-muted-foreground">Will be marked late</span>}
          <SalesStatusBadge status={cell?.status ?? null} />
        </span>
      </CardHeader>
      <CardContent className="space-y-5">
        {cell?.plannedYesterday !== null && cell?.plannedYesterday !== undefined && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            You planned <span className="font-num font-semibold">{cell.plannedYesterday}</span> lead follow-ups for
            today.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {SALES_REPORT_COUNT_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              htmlFor={`sr-${f.key}`}
              hint={f.help}
              error={error && invalid.includes(f.key) ? "Whole number, 0 or more" : undefined}
            >
              <Input
                id={`sr-${f.key}`}
                inputMode="numeric"
                type="number"
                min={0}
                max={SALES_REPORT_MAX_COUNT}
                step={1}
                value={counts[f.key]}
                onChange={(e) => setCounts((c) => ({ ...c, [f.key]: e.target.value }))}
                className="font-num"
              />
            </Field>
          ))}
        </div>
        <Field
          label="Challenges or support needed"
          htmlFor="sr-challenges"
          hint="Optional. Anything blocking you, or anything you need from the founders."
        >
          <Textarea
            id="sr-challenges"
            value={challenges}
            maxLength={SALES_REPORT_MAX_CHALLENGES}
            onChange={(e) => setChallenges(e.target.value)}
            placeholder="Write here..."
          />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {report && !report.dayOff ? `Submitted ${submittedLabel(cell!)}` : ""}
            {saved && <span className="ml-2 font-medium text-success">Saved</span>}
          </span>
          <div className="flex gap-2">
            {!report?.dayOff && (
              <Button variant="ghost" onClick={() => void dayOff()} disabled={save.isPending}>
                Mark as day off
              </Button>
            )}
            <Button onClick={() => void submit()} disabled={save.isPending}>
              {save.isPending ? "Saving..." : report && !report.dayOff ? "Save changes" : "Submit report"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function History({ days }: { days: SalesDayCell[] }) {
  const shown = days.filter((d) => d.status !== null);
  return (
    <Card className="mt-6 overflow-x-auto">
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Your last 30 days
          </span>
        </CardTitle>
      </CardHeader>
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-5 py-3">Date</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Enquiries</th>
            <th className="px-5 py-3">Follow-ups</th>
            <th className="px-5 py-3">Hot leads</th>
            <th className="px-5 py-3">Leads added</th>
            <th className="px-5 py-3">Sales</th>
            <th className="px-5 py-3">Received</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shown.map((d) => {
            const r = d.report && !d.report.dayOff ? d.report : null;
            return (
              <tr key={d.day}>
                <td className="whitespace-nowrap px-5 py-3.5">{dayLabel(d.day)}</td>
                <td className="px-5 py-3.5">
                  <SalesStatusBadge status={d.status} />
                </td>
                <td className="font-num px-5 py-3.5">{r?.enquiries ?? "–"}</td>
                <td className="font-num px-5 py-3.5">{r?.leadFollowUps ?? "–"}</td>
                <td className="font-num px-5 py-3.5">{r?.hotLeads ?? "–"}</td>
                <td className="font-num px-5 py-3.5">{d.figures.leadsAdded}</td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">{salesLabel(d.figures)}</td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">{formatINR(d.figures.paymentsReceived)}</td>
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr>
              <td colSpan={8} className="px-5 py-6 text-center text-muted-foreground">
                No reports yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  IndianRupee,
  MessageSquareWarning,
  PhoneCall,
  TrendingUp,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addWorkDays, formatINR } from "@gtb/shared";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { StatCard } from "@/components/StatCard";
import { Avatar, Button, Card, CardContent, CardHeader, CardTitle, Modal, PillFilter, Spinner } from "@/components/ui";
import { dayLabel, monthOf, rangeLabel, todayKey, weekOf } from "../team-pulse/pulseUi";
import {
  downloadSalesCsv,
  useSalesDay,
  useSalesPeriod,
  type SalesCro,
  type SalesDayCell,
  type SalesFigures,
  type SalesPeriodView,
} from "./salesApi";
import { Pair, ReportDetail, SalesStatusBadge, salesLabel } from "./salesUi";

type View = "day" | "week" | "month";

/** Founder view of the CROs' daily sales reports (SALES_REPORTS_DESIGN.md §10). Read-only. */
export function SalesReportsPage() {
  const [params, setParams] = useSearchParams();
  const view = (["day", "week", "month"].includes(params.get("view") ?? "") ? params.get("view") : "day") as View;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : todayKey();
  const today = todayKey();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();

  const set = (next: { view?: View; date?: string }) => {
    const p = new URLSearchParams(params);
    if (next.view) p.set("view", next.view);
    if (next.date) p.set("date", next.date);
    setParams(p, { replace: true });
  };
  const step = (dir: -1 | 1) => {
    if (view === "day") return set({ date: addWorkDays(date, dir) });
    if (view === "week") return set({ date: addWorkDays(date, dir * 7) });
    const [y, m] = monthOf(date).from.split("-").map(Number) as [number, number];
    set({ date: new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10) });
  };
  const period = view === "day" ? { from: date, to: date } : view === "week" ? weekOf(date) : monthOf(date);
  const atLatest = view === "day" ? date >= today : period.to >= today;

  async function exportCsv() {
    setExporting(true);
    setExportError(undefined);
    try {
      await downloadSalesCsv(period.from, period.to > today ? today : period.to);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Sales Reports"
        subtitle="Daily reports from the sales team, next to what GTB OS recorded. Visible to founders only."
        actions={
          <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        }
      />
      {exportError && <p className="mt-2 text-sm text-danger">{exportError}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <PillFilter
          options={[
            { id: "day", label: "Day" },
            { id: "week", label: "Week" },
            { id: "month", label: "Month" },
          ]}
          active={view}
          onChange={(v) => set({ view: v })}
        />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-num min-w-[150px] text-center text-sm font-medium">
            {view === "day" ? dayLabel(date, { year: true }) : rangeLabel(period.from, period.to)}
          </span>
          <Button variant="ghost" size="icon" aria-label="Next" disabled={atLatest} onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!atLatest && (
            <Button variant="outline" size="sm" onClick={() => set({ date: today })}>
              Today
            </Button>
          )}
        </div>
      </div>

      {view === "day" ? <DayView date={date} /> : <PeriodView from={period.from} to={period.to} />}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

function UnassignedNote({ figures: f }: { figures: SalesFigures }) {
  if (f.sales === 0 && f.payments === 0) return null;
  const bits = [
    f.sales ? `${f.sales} sale${f.sales === 1 ? "" : "s"}` : null,
    f.payments ? `${formatINR(f.paymentsReceived)} received` : null,
  ].filter(Boolean);
  return (
    <p className="px-5 pb-4 pt-1 text-xs text-muted-foreground">
      Not credited to any CRO: {bits.join(", ")}. These clients were not created by a CRO and have no CRO assigned.
      They are included in the totals above.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

function DayView({ date }: { date: string }) {
  const { data, isLoading, isError, refetch } = useSalesDay(date);
  const [open, setOpen] = useState<{ cro: SalesCro; cell: SalesDayCell }>();

  if (isError) return <div className="mt-6"><QueryErrorState onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) return <Loading />;
  if (data.rows.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState icon={Users} title="No CROs yet" hint="CROs added in Settings appear here." />
      </div>
    );
  }

  const t = data.totals;
  const challenges = data.rows.filter((r) => r.cell.report?.challenges);

  return (
    <div className="mt-6 space-y-6">
      <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={ClipboardCheck}
          label="Reports in"
          value={`${t.filed} / ${t.expected}`}
          accent="primary"
          footnote={data.day === data.today ? "Due by 4:00 am" : undefined}
        />
        <StatCard
          icon={Users}
          label="Enquiries reported"
          value={t.reported.enquiries}
          accent="info"
          footnote={`${t.figures.leadsAdded} leads added in GTB OS`}
        />
        <StatCard
          icon={PhoneCall}
          label="Lead follow-ups"
          value={t.reported.leadFollowUps}
          accent="warning"
          footnote={`${t.reported.plannedYesterday} planned yesterday`}
        />
        <StatCard
          icon={TrendingUp}
          label="Confirmed sales"
          value={t.figures.sales}
          accent="success"
          footnote={t.figures.salesValue ? formatINR(t.figures.salesValue) : undefined}
        />
        <StatCard
          icon={IndianRupee}
          label="Payments received"
          value={formatINR(t.figures.paymentsReceived)}
          accent="success"
          footnote={`${t.figures.payments} payment${t.figures.payments === 1 ? "" : "s"}`}
        />
      </div>

      <Card className="overflow-x-auto">
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <span className="text-xs text-muted-foreground">Reported / recorded in GTB OS</span>
        </CardHeader>
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3">CRO</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Enquiries / leads added</th>
              <th className="px-5 py-3">Follow-ups / planned</th>
              <th className="px-5 py-3">Hot leads</th>
              <th className="px-5 py-3">Sales</th>
              <th className="px-5 py-3">Received</th>
              <th className="px-5 py-3">
                <span className="sr-only">Challenges</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map(({ cro, cell }) => {
              const r = cell.report && !cell.report.dayOff ? cell.report : null;
              return (
                <tr
                  key={cro.id}
                  onClick={() => setOpen({ cro, cell })}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={cro.name} src={cro.avatarUrl} size="sm" className="h-7 w-7 text-[10px]" />
                      <span className="font-medium">{cro.name}</span>
                      {!cro.isActive && <span className="text-xs text-muted-foreground">(deactivated)</span>}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <SalesStatusBadge status={cell.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <Pair left={r?.enquiries ?? null} right={cell.figures.leadsAdded} />
                  </td>
                  <td className="px-5 py-3.5">
                    <Pair left={r?.leadFollowUps ?? null} right={cell.plannedYesterday} rightHint="Planned yesterday" />
                  </td>
                  <td className="font-num px-5 py-3.5">{r?.hotLeads ?? "–"}</td>
                  <td className="font-num whitespace-nowrap px-5 py-3.5">{salesLabel(cell.figures)}</td>
                  <td className="font-num whitespace-nowrap px-5 py-3.5">{formatINR(cell.figures.paymentsReceived)}</td>
                  <td className="px-5 py-3.5 text-warning">
                    {r?.challenges && <MessageSquareWarning className="h-4 w-4" aria-label="Has challenges" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <UnassignedNote figures={data.unassigned} />
      </Card>

      {challenges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Challenges and support needed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {challenges.map(({ cro, cell }) => (
              <div key={cro.id}>
                <p className="text-sm font-medium">{cro.name}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{cell.report!.challenges}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Modal
        open={Boolean(open)}
        onClose={() => setOpen(undefined)}
        title={open ? `${open.cro.name}, ${dayLabel(open.cell.day)}` : ""}
      >
        {open && <ReportDetail cell={open.cell} />}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week / month
// ---------------------------------------------------------------------------

function pct(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}

function PeriodView({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, refetch } = useSalesPeriod(from, to);
  if (isError) return <div className="mt-6"><QueryErrorState onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) return <Loading />;
  if (data.rows.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState icon={Users} title="No CROs yet" hint="CROs added in Settings appear here." />
      </div>
    );
  }

  const t = data.totals;
  const due = data.rows.reduce((s, r) => s + r.counts.submitted + r.counts.late + r.counts.missed, 0);
  const onTime = data.rows.reduce((s, r) => s + r.counts.submitted, 0);

  return (
    <div className="mt-6 space-y-6">
      <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={ClipboardCheck}
          label="Reports on time"
          value={pct(due ? onTime / due : null)}
          accent="primary"
          footnote={`${onTime} of ${due} due`}
        />
        <StatCard
          icon={Users}
          label="Enquiries reported"
          value={t.reported.enquiries}
          accent="info"
          footnote={`${t.figures.leadsAdded} leads added in GTB OS`}
        />
        <StatCard icon={PhoneCall} label="Lead follow-ups" value={t.reported.leadFollowUps} accent="warning" />
        <StatCard
          icon={TrendingUp}
          label="Confirmed sales"
          value={t.figures.sales}
          accent="success"
          footnote={t.figures.salesValue ? formatINR(t.figures.salesValue) : undefined}
        />
        <StatCard
          icon={IndianRupee}
          label="Payments received"
          value={formatINR(t.figures.paymentsReceived)}
          accent="success"
          footnote={`${t.figures.payments} payment${t.figures.payments === 1 ? "" : "s"}`}
        />
      </div>

      <TrendCard data={data} />

      <Card className="overflow-x-auto">
        <CardHeader>
          <CardTitle>By CRO</CardTitle>
        </CardHeader>
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3">CRO</th>
              <th className="px-5 py-3">On time</th>
              <th className="px-5 py-3">Late</th>
              <th className="px-5 py-3">Missed</th>
              <th className="px-5 py-3">Days off</th>
              <th className="px-5 py-3">Enquiries / leads added</th>
              <th className="px-5 py-3">Follow-ups</th>
              <th className="px-5 py-3">Hot leads</th>
              <th className="px-5 py-3">Sales</th>
              <th className="px-5 py-3">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((r) => (
              <tr key={r.cro.id}>
                <td className="px-5 py-3.5">
                  <span className="font-medium">{r.cro.name}</span>
                  {!r.cro.isActive && <span className="ml-2 text-xs text-muted-foreground">(deactivated)</span>}
                </td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">
                  {r.counts.submitted} <span className="text-muted-foreground">({pct(r.onTimeRate)})</span>
                </td>
                <td className="font-num px-5 py-3.5">{r.counts.late}</td>
                <td className={`font-num px-5 py-3.5 ${r.counts.missed ? "text-danger" : ""}`}>{r.counts.missed}</td>
                <td className="font-num px-5 py-3.5">{r.counts.day_off}</td>
                <td className="px-5 py-3.5">
                  <Pair left={r.reported.enquiries} right={r.figures.leadsAdded} />
                </td>
                <td className="font-num px-5 py-3.5">{r.reported.leadFollowUps}</td>
                <td className="font-num px-5 py-3.5">{r.reported.hotLeads}</td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">{salesLabel(r.figures)}</td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">{formatINR(r.figures.paymentsReceived)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <UnassignedNote figures={data.unassigned} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Challenges and support needed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.challenges.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing raised in this period.</p>
          ) : (
            data.challenges.map((c) => (
              <div key={`${c.cro.id}-${c.day}`}>
                <p className="text-sm">
                  <span className="font-medium">{c.cro.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{dayLabel(c.day)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{c.text}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TrendCard({ data }: { data: SalesPeriodView }) {
  // The whole period stays on the axis (future days empty) so bars keep a steady width.
  const rows = data.series.map((s) => ({
    ...s,
    label: data.series.length <= 7 ? dayLabel(s.day).split(",")[0] : String(Number(s.day.slice(8))),
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enquiries reported vs leads added in GTB OS</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--surface))",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="enquiries" name="Enquiries reported" fill="hsl(var(--groom))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="leadsAdded" name="Leads added" fill="hsl(var(--bride))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

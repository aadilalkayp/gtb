import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, Sheet } from "lucide-react";
import {
  ACTIVITY_MODULE_LABELS,
  addWorkDays,
  formatClockMinutes,
  formatDurationMinutes,
  isActivityModule,
  workDayRange,
} from "@gtb/shared";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Modal, Select, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ActivityLogView } from "./ActivityLogView";
import { downloadPulseCsv, usePulseStaff, type PulseSummary } from "./pulseApi";
import { MetricList, monthOf, rangeLabel, todayKey, weekOf, roleLabel } from "./pulseUi";

type Preset = "week" | "last7" | "last30" | "month" | "custom";

function presetRange(p: Exclude<Preset, "custom">): { from: string; to: string } {
  const today = todayKey();
  if (p === "week") return weekOf(today);
  if (p === "month") return monthOf(today);
  return { from: addWorkDays(today, p === "last7" ? -6 : -29), to: today };
}

function presetOf(from: string, to: string): Preset {
  for (const p of ["week", "last7", "last30", "month"] as const) {
    const r = presetRange(p);
    if (r.from === from && r.to === to) return p;
  }
  return "custom";
}

/** One staff member: summary, outputs, module time and the activity log (§8.2). */
export function StaffPulsePage() {
  const { id = "" } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const fallback = presetRange("week");
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = valid(params.get("from")) ?? fallback.from;
  const to = valid(params.get("to")) ?? fallback.to;
  const preset = presetOf(from, to);
  const [exporting, setExporting] = useState(false);

  const setRange = (r: { from: string; to: string }) => {
    if (r.from > r.to) return;
    setParams({ from: r.from, to: r.to }, { replace: true });
  };
  const { data, isLoading, isError, refetch } = usePulseStaff(id, from, to);

  return (
    <div className="page">
      <Link
        to="/team-pulse"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Team Pulse
      </Link>

      {isError ? (
        <div className="mt-6">
          <QueryErrorState onRetry={() => void refetch()} />
        </div>
      ) : isLoading || !data ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={data.staff.name} src={data.staff.avatarUrl} size="lg" />
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-display">{data.staff.name}</h1>
                <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                  {roleLabel(data.staff.role)}
                  {!data.staff.isActive && <Badge>Deactivated</Badge>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Period"
                value={preset}
                onChange={(e) => {
                  const p = e.target.value as Preset;
                  if (p !== "custom") setRange(presetRange(p));
                }}
                className="h-9 w-auto"
              >
                <option value="week">This week</option>
                <option value="last7">Last 7 days</option>
                <option value="last30">Last 30 days</option>
                <option value="month">This month</option>
                <option value="custom">Custom</option>
              </Select>
              {preset === "custom" && (
                <>
                  <Input
                    type="date"
                    aria-label="From"
                    value={from}
                    max={to}
                    onChange={(e) => e.target.value && setRange({ from: e.target.value, to })}
                    className="h-9 w-auto"
                  />
                  <Input
                    type="date"
                    aria-label="To"
                    value={to}
                    min={from}
                    onChange={(e) => e.target.value && setRange({ from, to: e.target.value })}
                    className="h-9 w-auto"
                  />
                </>
              )}
              <Button variant="outline" onClick={() => setExporting(true)}>
                <Download className="mr-1.5 h-4 w-4" /> Export
              </Button>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{rangeLabel(from, to)}</p>

          <SummaryTiles summary={data.summary} previous={data.previous} />

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Output</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <MetricList metrics={data.outputs} empty="No role outputs defined." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Timeliness</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <MetricList metrics={data.timeliness} empty="Nothing with a deadline was logged in this period." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Time by module</CardTitle>
              </CardHeader>
              <CardContent>
                <ModuleBreakdown modules={data.modules} />
              </CardContent>
            </Card>
          </div>

          <h2 className="mt-8 text-base font-semibold">Activity</h2>
          <div className="mt-3">
            <ActivityLogView userId={id} from={from} to={to} days={data.days} />
          </div>

          <ExportModal
            open={exporting}
            onClose={() => setExporting(false)}
            userId={id}
            name={data.staff.name}
            from={from}
            to={to}
          />
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  previous,
  better,
}: {
  label: string;
  value: string;
  previous?: string;
  /** Whether this period beats the last one (undefined = no comparison). */
  better?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-num mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {previous !== undefined && (
        <p
          className={cn(
            "font-num mt-0.5 text-xs",
            better === undefined ? "text-muted-foreground" : better ? "text-success" : "text-warning",
          )}
        >
          prev. {previous}
        </p>
      )}
    </div>
  );
}

function SummaryTiles({ summary: s, previous: p }: { summary: PulseSummary; previous: PulseSummary }) {
  const clock = (m: number | null) => (m === null ? "–" : formatClockMinutes(m));
  const hasPrev = p.daysActive > 0;
  return (
    <div className="stagger-children mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Tile
        label="Days active"
        value={String(s.daysActive)}
        previous={hasPrev ? String(p.daysActive) : undefined}
        better={hasPrev ? s.daysActive >= p.daysActive : undefined}
      />
      <Tile label="Avg start" value={clock(s.avgStart)} previous={hasPrev ? clock(p.avgStart) : undefined} />
      <Tile label="Avg end" value={clock(s.avgEnd)} previous={hasPrev ? clock(p.avgEnd) : undefined} />
      <Tile
        label="Active per day"
        value={s.daysActive ? formatDurationMinutes(s.avgActiveMinutesPerDay) : "–"}
        previous={hasPrev ? formatDurationMinutes(p.avgActiveMinutesPerDay) : undefined}
        better={hasPrev ? s.avgActiveMinutesPerDay >= p.avgActiveMinutesPerDay : undefined}
      />
      <Tile
        label="Total active"
        value={formatDurationMinutes(s.totalActiveMinutes)}
        previous={hasPrev ? formatDurationMinutes(p.totalActiveMinutes) : undefined}
      />
      <Tile
        label="Actions"
        value={String(s.actions)}
        previous={hasPrev ? String(p.actions) : undefined}
        better={hasPrev ? s.actions >= p.actions : undefined}
      />
    </div>
  );
}

const MODULE_SHADES = ["bg-primary", "bg-primary/75", "bg-primary/55", "bg-primary/40", "bg-primary/25", "bg-muted-foreground/30"];

function ModuleBreakdown({ modules }: { modules: Array<{ module: string; minutes: number }> }) {
  const total = modules.reduce((s, m) => s + m.minutes, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">No active time recorded in this period.</p>;
  const top = modules.slice(0, 5);
  const rest = modules.slice(5).reduce((s, m) => s + m.minutes, 0);
  const parts = rest > 0 ? [...top, { module: "rest", minutes: rest }] : top;
  const label = (m: string) => (m === "rest" ? "Everything else" : isActivityModule(m) ? ACTIVITY_MODULE_LABELS[m] : "Other");
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {parts.map((m, i) => (
          <span
            key={m.module}
            title={`${label(m.module)}: ${formatDurationMinutes(m.minutes)}`}
            className={cn("h-full", MODULE_SHADES[i])}
            style={{ width: `${(m.minutes / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {parts.map((m, i) => (
          <li key={m.module} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-sm", MODULE_SHADES[i])} />
              {label(m.module)}
            </span>
            <span className="font-num text-muted-foreground">
              {formatDurationMinutes(m.minutes)} · {Math.round((m.minutes / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExportModal({
  open,
  onClose,
  userId,
  name,
  from: initialFrom,
  to: initialTo,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  name: string;
  from: string;
  to: string;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [hideClients, setHideClients] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooLong = from <= to && workDayRange(from, to).length > 366;
  const invalid = from > to || tooLong;

  const pdfHref = `/team-pulse/staff/${userId}/report?${new URLSearchParams({
    from,
    to,
    ...(hideClients ? { hideClients: "1" } : {}),
    print: "1",
  }).toString()}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export report"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            loading={busy}
            disabled={invalid}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await downloadPulseCsv({ userId, name, from, to, hideClients });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Export failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Sheet className="mr-1.5 h-4 w-4" /> Download CSV
          </Button>
          <Button
            disabled={invalid}
            onClick={() => {
              window.open(pdfHref, "_blank", "noopener");
              onClose();
            }}
          >
            <FileText className="mr-1.5 h-4 w-4" /> Download PDF
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        A summary, a day-by-day table and the full activity list for {name}.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          From
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1.5" />
        </label>
        <label className="text-sm font-medium">
          To
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1.5" />
        </label>
      </div>
      {tooLong && <p className="mt-2 text-sm text-danger">A report covers at most a year.</p>}
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={hideClients}
          onChange={(e) => setHideClients(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
        />
        Hide client names (show initials)
      </label>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  );
}

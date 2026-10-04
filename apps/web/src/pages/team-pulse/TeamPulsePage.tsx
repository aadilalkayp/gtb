import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addWorkDays,
  formatClockMinutes,
  formatDurationMinutes,
} from "@gtb/shared";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Avatar, Button, Card, CardContent, CardHeader, CardTitle, PillFilter, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { usePulseDay, usePulsePeriod, type PulseDayRow, type PulsePeriodRow } from "./pulseApi";
import {
  AxisLabels,
  axisFor,
  axisPct,
  dayLabel,
  moduleLabel,
  monthOf,
  PresenceDot,
  PulseTabs,
  rangeLabel,
  timeLabel,
  todayKey,
  TONE_TICK,
  weekOf,
  roleLabel,
} from "./pulseUi";

type View = "day" | "week" | "month";

/** Team Pulse overview (TEAM_PULSE_DESIGN.md §8.1). Founders only. */
export function TeamPulsePage() {
  const [params, setParams] = useSearchParams();
  const view = (["day", "week", "month"].includes(params.get("view") ?? "") ? params.get("view") : "day") as View;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : todayKey();
  const today = todayKey();

  const set = (next: { view?: View; date?: string }) => {
    const p = new URLSearchParams(params);
    if (next.view) p.set("view", next.view);
    if (next.date) p.set("date", next.date);
    setParams(p, { replace: true });
  };
  const step = (dir: -1 | 1) => {
    if (view === "day") return set({ date: addWorkDays(date, dir) });
    if (view === "week") return set({ date: addWorkDays(date, dir * 7) });
    const { from } = monthOf(date);
    const [y, m] = from.split("-").map(Number) as [number, number];
    const target = new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10);
    set({ date: target });
  };
  const period = view === "week" ? weekOf(date) : monthOf(date);
  const atLatest = view === "day" ? date >= today : period.to >= today;

  return (
    <div className="page">
      <PageHeader
        title="Team Pulse"
        subtitle="When the team works, what they get done, and how promptly it's logged. Visible to founders only."
      />
      <PulseTabs />

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

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

function DayView({ date }: { date: string }) {
  const { data, isLoading, isError, refetch } = usePulseDay(date);
  const navigate = useNavigate();
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const working = rows.filter((r) => r.presence);
  const axis = useMemo(
    () => axisFor(rows.flatMap((r) => (r.stats ? [r.stats.firstSeenAt, r.stats.lastSeenAt] : []))),
    [rows],
  );
  const open = (r: PulseDayRow) => navigate(`/team-pulse/staff/${r.staff.id}?from=${date}&to=${date}`);

  if (isError) return <div className="mt-6"><QueryErrorState onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState icon={Activity} title="No staff to show" hint="Staff appear here once they're added in Settings." />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {data.isToday && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Working now">
          <span className="text-sm text-muted-foreground">Working now</span>
          {working.length === 0 ? (
            <span className="text-sm text-muted-foreground">· nobody active in the last 15 minutes</span>
          ) : (
            working.map((r) => (
              <Link
                key={r.staff.id}
                to={`/team-pulse/staff/${r.staff.id}?from=${date}&to=${date}`}
                className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-2.5 pr-3 text-sm transition-colors hover:border-border-strong"
              >
                <PresenceDot state={r.presence!.state} />
                <span className="font-medium">{r.staff.name.split(" ")[0]}</span>
                <span className="text-muted-foreground">
                  {r.presence!.state === "active" ? moduleLabel(r.presence!.module) : "idle"}
                </span>
              </Link>
            ))
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team timeline</CardTitle>
          <span className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-full bg-primary/70" /> active
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-full bg-primary/10 ring-1 ring-inset ring-primary/20" /> first to last
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-0.5 bg-primary" /> action
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-0.5 bg-warning" /> correction
            </span>
          </span>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="grid grid-cols-[150px_minmax(0,1fr)_70px] gap-4">
            <span />
            <AxisLabels axis={axis} />
            <span className="text-right text-[11px] text-muted-foreground">active</span>
          </div>
          {rows.map((r) => (
            <button
              key={r.staff.id}
              onClick={() => open(r)}
              className="grid w-full grid-cols-[150px_minmax(0,1fr)_70px] items-center gap-4 rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={r.staff.name} src={r.staff.avatarUrl} size="sm" className="h-7 w-7 text-[10px]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.staff.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{roleLabel(r.staff.role)}</span>
                </span>
              </span>
              <span className="relative h-6">
                {r.stats ? (
                  <>
                    <span className="absolute inset-x-0 top-2 h-2 rounded-full bg-muted" />
                    <span
                      className="absolute top-2 h-2 rounded-full bg-primary/10"
                      style={{
                        left: `${axisPct(r.stats.firstSeenAt, axis)}%`,
                        right: `${100 - axisPct(r.stats.lastSeenAt, axis)}%`,
                      }}
                    />
                    {r.blocks.map(([s, e]) => (
                      <span
                        key={s}
                        className="absolute top-2 h-2 rounded-full bg-primary/70"
                        style={{
                          left: `${axisPct(s, axis)}%`,
                          width: `${Math.max(0.6, axisPct(e, axis) - axisPct(s, axis))}%`,
                        }}
                      />
                    ))}
                    {r.ticks.map((t, i) => (
                      <span
                        key={`${t.at}-${i}`}
                        title={timeLabel(t.at)}
                        className={cn("absolute top-0 h-1.5 w-0.5 rounded-full", TONE_TICK[t.tone])}
                        style={{ left: `${axisPct(t.at, axis)}%` }}
                      />
                    ))}
                  </>
                ) : (
                  <span className="absolute left-0 top-1 text-xs text-muted-foreground">No activity</span>
                )}
              </span>
              <span className="font-num text-right text-sm">
                {r.stats ? formatDurationMinutes(r.stats.activeMinutes) : "–"}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3">Staff</th>
              <th className="px-5 py-3">Start</th>
              <th className="px-5 py-3">End</th>
              <th className="px-5 py-3">Active</th>
              <th className="px-5 py-3">Actions</th>
              <th className="px-5 py-3">Key output</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.staff.id} onClick={() => open(r)} className="cursor-pointer transition-colors hover:bg-muted/50">
                <td className="px-5 py-3.5">
                  <span className="font-medium">{r.staff.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{roleLabel(r.staff.role)}</span>
                  {!r.staff.isActive && <span className="ml-2 text-xs text-muted-foreground">(deactivated)</span>}
                </td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">{r.stats ? timeLabel(r.stats.firstSeenAt) : "–"}</td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">{r.stats ? timeLabel(r.stats.lastSeenAt) : "–"}</td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">{r.stats ? formatDurationMinutes(r.stats.activeMinutes) : "–"}</td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">{r.actions || "–"}</td>
                <td className="px-5 py-3.5 text-muted-foreground">
                  {r.outputs.length
                    ? r.outputs
                        .slice(0, 2)
                        .map((o) => `${o.label}: ${o.value}${o.hint ? ` (${o.hint})` : ""}`)
                        .join(" · ")
                    : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week / month
// ---------------------------------------------------------------------------

/** Heat steps for active hours per day: none, <2h, <4h, <6h, 6h+. */
function heat(minutes: number | undefined): string {
  if (!minutes) return "bg-muted";
  if (minutes < 120) return "bg-primary/20";
  if (minutes < 240) return "bg-primary/40";
  if (minutes < 360) return "bg-primary/65";
  return "bg-primary/90";
}

function PeriodView({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, refetch } = usePulsePeriod(from, to);
  const navigate = useNavigate();
  const today = todayKey();
  if (isError) return <div className="mt-6"><QueryErrorState onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }
  const open = (r: PulsePeriodRow) => navigate(`/team-pulse/staff/${r.staff.id}?from=${from}&to=${to}`);

  return (
    <div className="mt-6 space-y-6">
      <Card className="overflow-x-auto">
        <CardHeader>
          <CardTitle>Active hours by day</CardTitle>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            less
            {["bg-muted", "bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary/90"].map((c) => (
              <span key={c} className={cn("h-3 w-3 rounded-sm", c)} />
            ))}
            more
          </span>
        </CardHeader>
        <CardContent>
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th />
                {data.days.map((d) => (
                  <th key={d} className="font-num w-7 text-center text-[10px] font-normal text-muted-foreground">
                    {data.days.length <= 7 ? dayLabel(d).split(",")[0] : Number(d.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.staff.id} className="cursor-pointer" onClick={() => open(r)}>
                  <td className="pr-3 text-sm">
                    <span className="block max-w-[160px] truncate font-medium">{r.staff.name}</span>
                  </td>
                  {data.days.map((d) => (
                    <td key={d}>
                      <span
                        title={`${dayLabel(d)}: ${r.byDay[d] ? formatDurationMinutes(r.byDay[d]!) : "no activity"}`}
                        className={cn(
                          "block h-7 w-7 rounded-md transition-transform hover:scale-110",
                          d > today ? "bg-muted/40" : heat(r.byDay[d]),
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3">Staff</th>
              <th className="px-5 py-3">Days active</th>
              <th className="px-5 py-3">Avg start</th>
              <th className="px-5 py-3">Avg end</th>
              <th className="px-5 py-3">Active / day</th>
              <th className="px-5 py-3">Actions</th>
              <th className="px-5 py-3">Output</th>
              <th className="px-5 py-3">Timeliness</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((r) => (
              <tr key={r.staff.id} onClick={() => open(r)} className="cursor-pointer align-top transition-colors hover:bg-muted/50">
                <td className="px-5 py-3.5">
                  <span className="font-medium">{r.staff.name}</span>
                  <span className="block text-xs text-muted-foreground">{roleLabel(r.staff.role)}</span>
                </td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">{r.summary.daysActive}</td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">
                  {r.summary.avgStart === null ? "–" : formatClockMinutes(r.summary.avgStart)}
                </td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">
                  {r.summary.avgEnd === null ? "–" : formatClockMinutes(r.summary.avgEnd)}
                </td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">
                  {r.summary.daysActive ? formatDurationMinutes(r.summary.avgActiveMinutesPerDay) : "–"}
                </td>
                <td className="font-num whitespace-nowrap px-5 py-3.5">{r.summary.actions || "–"}</td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">
                  {r.outputs.filter((o) => o.value !== "0").slice(0, 3).map((o) => (
                    <span key={o.key} className="block">
                      {o.label}: <span className="font-num font-semibold text-foreground">{o.value}</span>
                      {o.hint ? ` (${o.hint})` : ""}
                    </span>
                  ))}
                  {r.outputs.every((o) => o.value === "0") && "–"}
                </td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">
                  {r.timeliness.slice(0, 2).map((t) => (
                    <span key={t.key} className="block">
                      {t.label}: <span className="font-num font-semibold text-foreground">{t.value}</span>
                    </span>
                  ))}
                  {r.timeliness.length === 0 && "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

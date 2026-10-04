import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Eye, History, Search } from "lucide-react";
import {
  ACTIVITY_MODULES,
  ACTIVITY_MODULE_LABELS,
  formatDurationMinutes,
  humanizeIdentifier,
  workDayKey,
  type ActivityDescription,
} from "@gtb/shared";
import { Badge, Input, PillFilter, Select, Spinner } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { LoadMoreButton } from "@/components/LoadMoreButton";
import { QueryErrorState } from "@/components/QueryErrorState";
import { cn } from "@/lib/utils";
import { usePulseFeed, type PulseDayStats, type PulseFeedDetail, type PulseFeedEntry } from "./pulseApi";
import { activityIcon, axisFor, DayBar, dayLabel, moduleLabel, timeLabel, TONE_CHIP } from "./pulseUi";

/**
 * The chronological activity log (TEAM_PULSE_DESIGN.md §8.2): grouped by work
 * day, newest first, entries as sentences, idle gaps and repeated views
 * collapsed. Used for one staff member, the whole team, or one client.
 */

type KindFilter = "all" | "changes" | "views" | "auth";
const KIND_PARAM: Record<KindFilter, string | undefined> = {
  all: undefined,
  changes: "change,export",
  views: "view",
  auth: "auth",
};
const IDLE_GAP_MIN = 15;

type Item =
  | { type: "entry"; at: string; entry: PulseFeedEntry }
  | { type: "views"; at: string; entries: PulseFeedEntry[] }
  | { type: "idle"; at: string; minutes: number };

export function ActivityLogView({
  userId,
  clientId,
  from,
  to,
  days,
  showActor = false,
  foundersToggle = false,
  includeFounders: includeFoundersDefault = false,
}: {
  userId?: string;
  clientId?: string;
  from?: string;
  to?: string;
  /** Per-day stats for day headers, day bars and idle gaps (one staff member). */
  days?: PulseDayStats[];
  showActor?: boolean;
  foundersToggle?: boolean;
  includeFounders?: boolean;
}) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [module, setModule] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [includeFounders, setIncludeFounders] = useState(includeFoundersDefault);
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const feed = usePulseFeed({
    userId,
    clientId,
    from,
    to,
    kinds: KIND_PARAM[kind],
    module: module || undefined,
    q: q || undefined,
    includeFounders,
  });
  const entries = useMemo(() => feed.data?.pages.flatMap((p) => p.entries) ?? [], [feed.data]);
  const dayStats = useMemo(() => new Map((days ?? []).map((d) => [d.day, d])), [days]);
  const grouped = useMemo(
    () => groupByDay(entries, dayStats, kind === "all" && !module && !q),
    [entries, dayStats, kind, module, q],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <PillFilter
          options={[
            { id: "all", label: "All" },
            { id: "changes", label: "Changes" },
            { id: "views", label: "Views" },
            { id: "auth", label: "Sign-ins" },
          ]}
          active={kind}
          onChange={setKind}
        />
        <Select
          aria-label="Module"
          value={module}
          onChange={(e) => setModule(e.target.value)}
          className="h-8 w-auto text-sm"
        >
          <option value="">All modules</option>
          {ACTIVITY_MODULES.filter((m) => m !== "other").map((m) => (
            <option key={m} value={m}>
              {ACTIVITY_MODULE_LABELS[m]}
            </option>
          ))}
        </Select>
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search activity"
            placeholder="Search client or action"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        {foundersToggle && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeFounders}
              onChange={(e) => setIncludeFounders(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
            />
            Include founders
          </label>
        )}
      </div>

      <div className="mt-4">
        {feed.isError ? (
          <QueryErrorState onRetry={() => void feed.refetch()} />
        ) : feed.isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={History}
            title="No activity recorded"
            hint="Activity appears here as it happens. Recording started when Team Pulse went live."
          />
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <DaySection key={g.day} group={g} showActor={showActor} />
            ))}
            {feed.hasNextPage &&
              (feed.isFetchingNextPage ? (
                <div className="flex justify-center pt-4">
                  <Spinner className="h-4 w-4 text-muted-foreground" />
                </div>
              ) : (
                <LoadMoreButton onClick={() => void feed.fetchNextPage()} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

interface DayGroup {
  day: string;
  stats?: PulseDayStats;
  items: Item[];
  count: number;
}

function groupByDay(entries: PulseFeedEntry[], stats: Map<string, PulseDayStats>, withGaps: boolean): DayGroup[] {
  const order: string[] = [];
  const byDay = new Map<string, PulseFeedEntry[]>();
  for (const e of entries) {
    const day = workDayKey(new Date(e.at));
    if (!byDay.has(day)) {
      byDay.set(day, []);
      order.push(day);
    }
    byDay.get(day)!.push(e);
  }
  return order.map((day) => {
    const list = byDay.get(day)!;
    const items: Item[] = [];
    // Consecutive profile views by the same person collapse into one row.
    for (const e of list) {
      const prev = items[items.length - 1];
      if (e.verb === "client.viewed") {
        if (prev?.type === "views" && prev.entries[0]!.actor?.id === e.actor?.id) {
          prev.entries.push(e);
          continue;
        }
        if (prev?.type === "entry" && prev.entry.verb === "client.viewed" && prev.entry.actor?.id === e.actor?.id) {
          items[items.length - 1] = { type: "views", at: prev.at, entries: [prev.entry, e] };
          continue;
        }
      }
      items.push({ type: "entry", at: e.at, entry: e });
    }
    const dayStats = stats.get(day);
    if (withGaps && dayStats) {
      const blocks = dayStats.blocks;
      for (let i = 1; i < blocks.length; i++) {
        const gapStart = new Date(blocks[i - 1]![1]).getTime();
        const gapEnd = new Date(blocks[i]![0]).getTime();
        const minutes = Math.round((gapEnd - gapStart) / 60_000);
        if (minutes >= IDLE_GAP_MIN) {
          items.push({ type: "idle", at: new Date((gapStart + gapEnd) / 2).toISOString(), minutes });
        }
      }
      items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    }
    return { day, stats: dayStats, items, count: list.length };
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function DaySection({ group, showActor }: { group: DayGroup; showActor: boolean }) {
  const s = group.stats;
  const axis = s ? axisFor([s.firstSeenAt, s.lastSeenAt]) : null;
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">{dayLabel(group.day, { year: true })}</h3>
        <p className="font-num text-xs text-muted-foreground">
          {s
            ? `First ${timeLabel(s.firstSeenAt)} · Last ${timeLabel(s.lastSeenAt)} · ${formatDurationMinutes(s.activeMinutes)} active · `
            : ""}
          {group.count} {group.count === 1 ? "entry" : "entries"}
        </p>
      </div>
      {s && axis && s.blocks.length > 0 && (
        <DayBar blocks={s.blocks} span={[s.firstSeenAt, s.lastSeenAt]} axis={axis} className="mt-2" />
      )}
      <ul className="card mt-3 divide-y divide-border px-4">
        {group.items.map((item) =>
          item.type === "idle" ? (
            <li key={`idle-${item.at}`} className="py-2 pl-[104px] text-xs text-muted-foreground">
              <span className="border-t border-dashed border-border-strong pt-0.5">
                Idle {formatDurationMinutes(item.minutes)}
              </span>
            </li>
          ) : item.type === "views" ? (
            <ViewsRow key={item.entries[0]!.id} entries={item.entries} showActor={showActor} />
          ) : (
            <EntryRow key={item.entry.id} entry={item.entry} showActor={showActor} />
          ),
        )}
      </ul>
    </section>
  );
}

function Sentence({ d, client }: { d: ActivityDescription; client: PulseFeedEntry["client"] }) {
  const link = client ? (
    <Link to={`/clients/${client.id}`} className="font-medium text-primary hover:underline">
      {client.name}
    </Link>
  ) : null;
  if (d.template.includes("{client}")) {
    const [before, after] = d.template.split("{client}");
    return (
      <>
        {before}
        {link ?? "a client"}
        {after}
      </>
    );
  }
  return (
    <>
      {d.template}
      {link && <> for {link}</>}
    </>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(new Date(v));
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Ids and foreign keys are noise to a reader; the sentence already names the client. */
const HIDDEN_FIELD = /^id$|Id$/;

function ChangeList({ changes }: { changes: unknown }) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return null;
  const all = Object.entries(changes as Record<string, unknown>);
  const rows = all.filter(([field]) => !HIDDEN_FIELD.test(field));
  if (rows.length === 0) return null;
  // A freshly created record diffs every field from empty: list values instead.
  const created = all.every(([, v]) => Array.isArray(v) && v.length === 2 && v[0] === null);
  return (
    <dl className="mt-1 grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {rows.map(([field, value]) => {
        const diff = Array.isArray(value) && value.length === 2 && !created;
        return (
          <div key={field} className="contents">
            <dt className="truncate text-muted-foreground">{humanizeIdentifier(field)}</dt>
            <dd className="font-num break-words">
              {diff ? (
                <>
                  <span className="text-muted-foreground line-through decoration-muted-foreground/40">
                    {formatValue(value[0])}
                  </span>{" "}
                  <span className="text-muted-foreground">to</span> {formatValue(value[1])}
                </>
              ) : (
                formatValue(Array.isArray(value) && value.length === 2 ? value[1] : value)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function RelatedChange({ detail }: { detail: PulseFeedDetail }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-xs font-medium">{detail.description.template.replace("{client}", "the client")}</p>
      <ChangeList changes={detail.changes} />
    </div>
  );
}

function EntryRow({ entry, showActor }: { entry: PulseFeedEntry; showActor: boolean }) {
  const [open, setOpen] = useState(false);
  const d = entry.description;
  const Icon = activityIcon(entry.verb);
  const hasChanges =
    !!entry.changes && typeof entry.changes === "object" && Object.keys(entry.changes as object).length > 0;
  const expandable = hasChanges || entry.details.length > 0;
  return (
    <li className="grid grid-cols-[60px_32px_minmax(0,1fr)_auto] items-start gap-3 py-3">
      <span className="font-num pt-1.5 text-xs text-muted-foreground">{timeLabel(entry.at)}</span>
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", TONE_CHIP[d.tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 pt-1">
        <p className="text-sm">
          {showActor && entry.actor && <span className="font-medium">{entry.actor.name} · </span>}
          {showActor && !entry.actor && <span className="font-medium text-muted-foreground">System · </span>}
          <Sentence d={d} client={entry.client} />
        </p>
        {d.detail && <p className="font-num mt-0.5 text-xs text-muted-foreground">{d.detail}</p>}
        {expandable && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-150", open && "rotate-180")} />
            {open ? "Hide details" : entry.details.length > 0 ? `Details · ${entry.details.length + 1} changes` : "Details"}
          </button>
        )}
        {open && (
          <div className="mt-2 space-y-2">
            {hasChanges && <ChangeList changes={entry.changes} />}
            {entry.details.map((x) => (
              <RelatedChange key={x.id} detail={x} />
            ))}
          </div>
        )}
      </div>
      {entry.module ? <Badge className="mt-1 hidden sm:inline-flex">{moduleLabel(entry.module)}</Badge> : <span />}
    </li>
  );
}

function ViewsRow({ entries, showActor }: { entries: PulseFeedEntry[]; showActor: boolean }) {
  const [open, setOpen] = useState(false);
  const first = entries[entries.length - 1]!;
  const last = entries[0]!;
  return (
    <li className="grid grid-cols-[60px_32px_minmax(0,1fr)_auto] items-start gap-3 py-3">
      <span className="font-num pt-1.5 text-xs text-muted-foreground">{timeLabel(last.at)}</span>
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", TONE_CHIP.neutral)}>
        <Eye className="h-4 w-4" />
      </span>
      <div className="min-w-0 pt-1">
        <p className="text-sm text-muted-foreground">
          {showActor && last.actor && <span className="font-medium text-foreground">{last.actor.name} · </span>}
          Viewed {entries.length} client profiles
          <span className="font-num text-xs"> · {timeLabel(first.at)} to {timeLabel(last.at)}</span>
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-150", open && "rotate-180")} />
          {open ? "Hide" : "Show clients"}
        </button>
        {open && (
          <ul className="mt-2 space-y-1 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="font-num w-16 text-xs text-muted-foreground">{timeLabel(e.at)}</span>
                {e.client ? (
                  <Link to={`/clients/${e.client.id}`} className="text-primary hover:underline">
                    {e.client.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">A client</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Badge className="mt-1 hidden sm:inline-flex">Clients</Badge>
    </li>
  );
}

import { Check, Sparkles } from "lucide-react";
import { SCAN_CATEGORY_LABELS, formatDate, type ScanCategory } from "@gtb/shared";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/ui";

/** Category score rows shared by the funnel report, portal, and staff 360°. */
export function ScoreBars({
  scores,
  className,
}: {
  scores: { skin: number; hair: number; beard: number; style: number };
  className?: string;
}) {
  const rows = (Object.keys(SCAN_CATEGORY_LABELS) as ScanCategory[]).map((c) => ({
    label: SCAN_CATEGORY_LABELS[c],
    value: scores[c],
  }));
  return (
    <div className={cn("space-y-3", className)}>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{r.label}</span>
            <span className="font-num font-semibold">{r.value}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out-strong"
              style={{ width: `${r.value}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The headline readiness ring with countdown. */
export function ReadinessHero({
  readiness,
  daysToWedding,
  weddingDate,
}: {
  readiness: number;
  daysToWedding: number;
  weddingDate?: string;
}) {
  return (
    <div className="flex items-center gap-5">
      <ProgressRing value={readiness / 100} size={104} strokeWidth={9} className="text-primary">
        <div className="text-center leading-tight">
          <span className="font-num text-2xl font-bold">{readiness}</span>
          <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            ready
          </span>
        </div>
      </ProgressRing>
      <div>
        <p className="font-display text-lg font-semibold">Wedding Readiness</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className="font-num font-semibold text-foreground">{Math.max(daysToWedding, 0)}</span>{" "}
          days to the big day
          {weddingDate ? ` · ${formatDate(weddingDate)}` : ""}
        </p>
      </div>
    </div>
  );
}

/** Focus-area weighting ("70% pigmentation…") as proportional chips. */
export function FocusAreas({ areas }: { areas: { area: string; weight: number }[] }) {
  if (!areas.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">Where to focus</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {areas.map((f) => (
          <span
            key={f.area}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
          >
            <span className="font-num font-bold">{f.weight}%</span> {f.area}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HighlightsAndSuggestions({
  highlights,
  suggestions,
}: {
  highlights: string[];
  suggestions: string[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {highlights.length > 0 && (
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Working for you
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {highlights.map((h) => (
              <li key={h} className="flex gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> {h}
              </li>
            ))}
          </ul>
        </div>
      )}
      {suggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Your routine</h3>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
            {suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export interface RoadmapEntry {
  id: string;
  kind: string;
  category: string;
  title: string;
  description: string | null;
  dueDate: string | Date;
  weekNumber: number | null;
  isDone: boolean;
}

/** Roadmap timeline. Pass `onToggle` to make items tickable (portal). */
export function RoadmapList({
  items,
  onToggle,
}: {
  items: RoadmapEntry[];
  onToggle?: (item: RoadmapEntry) => void;
}) {
  if (!items.length) return null;
  const sorted = [...items].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );
  return (
    <ol className="space-y-2.5">
      {sorted.map((item) => (
        <li
          key={item.id}
          className={cn(
            "flex items-start gap-3 rounded-lg border border-border bg-surface p-3",
            item.isDone && "opacity-60",
          )}
        >
          {onToggle ? (
            <button
              onClick={() => onToggle(item)}
              aria-label={item.isDone ? "Mark not done" : "Mark done"}
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 active:scale-95",
                item.isDone
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border-strong hover:border-primary",
              )}
            >
              {item.isDone && <Check className="h-3 w-3" />}
            </button>
          ) : (
            <span
              className={cn(
                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                item.kind === "checklist" ? "bg-warning" : "bg-primary",
              )}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className={cn("text-sm font-medium", item.isDone && "line-through")}>
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.weekNumber ? `Week ${item.weekNumber} · ` : ""}
                {formatDate(item.dueDate)}
              </p>
            </div>
            {item.description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

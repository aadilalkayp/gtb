import { Check, Lock, Sparkles } from "lucide-react";
import { formatDate, type ScanCategory } from "@gtb/shared";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/ui";

type CategoryLabels = Record<ScanCategory, string>;
const DEFAULT_LABELS: CategoryLabels = {
  skin: "Skin",
  hair: "Hair",
  beard: "Beard",
  style: "Style",
};

/** Category score rows shared by the funnel report, portal, and staff 360°.
 *  Style is null until a full-body photo is scanned — shown locked, not zero. */
export function ScoreBars({
  scores,
  labels = DEFAULT_LABELS,
  className,
}: {
  scores: { skin: number; hair: number; beard: number; style: number | null };
  labels?: CategoryLabels;
  className?: string;
}) {
  const rows = (Object.keys(labels) as ScanCategory[]).map((c) => ({
    key: c,
    label: labels[c],
    value: scores[c],
  }));
  return (
    <div className={cn("space-y-3", className)}>
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{r.label}</span>
            {r.value == null ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> add a full-body photo
              </span>
            ) : (
              <span className="font-num font-semibold">{r.value}</span>
            )}
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500 ease-out-strong",
                r.value == null ? "bg-border-strong" : "bg-primary",
              )}
              style={{ width: `${r.value ?? 0}%` }}
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
  appearance,
  daysToWedding,
  weddingDate,
}: {
  readiness: number;
  /** Appearance-only score, shown as a sub-line when it differs from the composite. */
  appearance?: number;
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
          <span className="font-num font-semibold text-foreground">
            {Math.max(daysToWedding, 0)}
          </span>{" "}
          days to the big day
          {weddingDate ? ` · ${formatDate(weddingDate)}` : ""}
        </p>
        {appearance != null && appearance !== readiness && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Appearance <span className="font-num font-medium text-foreground">{appearance}</span> ·
            moves with your prep and self-assessment
          </p>
        )}
      </div>
    </div>
  );
}

export interface GroomScoreView {
  appearance: number;
  fitness: number | null;
  confidence: number | null;
  prepProgress: number | null;
  scores: { skin: number; hair: number; beard: number; style: number | null };
  labels: CategoryLabels;
}

/**
 * The six-tile Groom Score dashboard from the brief: four appearance categories
 * plus Fitness and Confidence (self-reported — a photo can't rate them) and
 * the prep-progress ring. Locked tiles say exactly what unlocks them.
 */
export function GroomScoreGrid({
  score,
  onUnlockStyle,
  onUnlockSelfReport,
}: {
  score: GroomScoreView;
  onUnlockStyle?: () => void;
  onUnlockSelfReport?: () => void;
}) {
  const tiles: { label: string; value: number | null; unlock?: string; action?: () => void }[] = [
    { label: score.labels.skin, value: score.scores.skin },
    { label: score.labels.hair, value: score.scores.hair },
    { label: score.labels.beard, value: score.scores.beard },
    {
      label: score.labels.style,
      value: score.scores.style,
      unlock: "Add a full-body photo",
      action: onUnlockStyle,
    },
    {
      label: "Fitness",
      value: score.fitness,
      unlock: "Answer 4 quick questions",
      action: onUnlockSelfReport,
    },
    {
      label: "Confidence",
      value: score.confidence,
      unlock: "Answer 4 quick questions",
      action: onUnlockSelfReport,
    },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={cn(
              "rounded-lg border border-border p-3",
              t.value == null ? "bg-muted/40" : "bg-surface",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
            {t.value == null ? (
              <button
                type="button"
                onClick={t.action}
                disabled={!t.action}
                className="mt-1 flex items-center gap-1 text-left text-xs font-medium text-primary hover:underline disabled:cursor-default disabled:no-underline"
              >
                <Lock className="h-3 w-3 shrink-0" /> {t.unlock}
              </button>
            ) : (
              <p className="font-num mt-0.5 text-2xl font-bold">{t.value}</p>
            )}
          </div>
        ))}
      </div>
      {score.prepProgress != null && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
          <ProgressRing
            value={score.prepProgress / 100}
            size={44}
            strokeWidth={5}
            className="text-primary"
          >
            <span className="font-num text-[11px] font-bold">{score.prepProgress}%</span>
          </ProgressRing>
          <div className="text-sm">
            <p className="font-medium">Prep progress</p>
            <p className="text-xs text-muted-foreground">
              Roadmap tasks ticked off on time — every tick moves your readiness.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Attribute-level appearance metrics — the "detailed analysis" from Step 2. */
export function AttributeList({
  attributes,
}: {
  attributes: { key: string; label: string; score: number }[];
}) {
  if (!attributes.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">Detailed analysis</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Appearance ratings only — never a medical assessment.
      </p>
      <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {attributes.map((a) => (
          <div key={a.key} className="flex items-center gap-3 text-sm">
            <span className="w-36 shrink-0 text-muted-foreground">{a.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${a.score}%` }} />
            </div>
            <span className="font-num w-7 text-right text-xs font-semibold">{a.score}</span>
          </div>
        ))}
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

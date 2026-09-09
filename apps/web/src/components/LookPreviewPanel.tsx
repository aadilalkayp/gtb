import { useEffect, useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { looksFor, type LookKind, type LookStyle } from "@gtb/shared";
import { fetchLooks, requestLook, type LookPreview } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PillFilter } from "@/components/ui";

/**
 * Hairstyle / beard previews (Step 4): pick a catalog style, we render it onto
 * your own selfie. Each render costs money, so the panel shows the daily
 * allowance and reuses finished renders.
 */
export function LookPreviewPanel({ scanId, type }: { scanId: string; type: "groom" | "bride" }) {
  const kinds: LookKind[] = type === "bride" ? ["hairstyle"] : ["hairstyle", "beard"];
  const [kind, setKind] = useState<LookKind>("hairstyle");
  const [looks, setLooks] = useState<Record<string, LookPreview>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LookStyle | null>(null);

  useEffect(() => {
    fetchLooks(scanId)
      .then((r) => {
        setLooks(Object.fromEntries(r.looks.map((l) => [l.styleKey, l])));
        setRemaining(r.remainingToday);
      })
      .catch(() => setRemaining(0));
  }, [scanId]);

  const styles = looksFor(type, kind);

  const generate = async (style: LookStyle) => {
    setSelected(style);
    if (looks[style.key]?.url) return;
    setPending(style.key);
    setError(null);
    try {
      const res = await requestLook(scanId, style.key);
      setLooks((l) => ({ ...l, [style.key]: res.look }));
      if (!res.cached) setRemaining((r) => (r == null ? r : Math.max(0, r - 1)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not render that look.");
    } finally {
      setPending(null);
    }
  };

  const current = selected ? looks[selected.key] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Wand2 className="h-5 w-5 text-primary" /> Preview a look
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            See {type === "bride" ? "ten hairstyles" : "ten hairstyles and ten beard styles"} on
            your own photo before you commit at the salon.
          </p>
        </div>
        {remaining != null && (
          <span className="font-num rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {remaining} previews left today
          </span>
        )}
      </div>

      {kinds.length > 1 && (
        <PillFilter
          options={kinds.map((k) => ({ id: k, label: k === "beard" ? "Beard" : "Hair" }))}
          active={kind}
          onChange={setKind}
        />
      )}

      {selected && (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="relative aspect-square w-full bg-muted">
            {current?.url ? (
              <img src={current.url} alt={selected.label} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-6 w-6 animate-pulse text-primary" />
                {pending === selected.key ? "Rendering your look…" : "Tap a style to render it"}
              </div>
            )}
          </div>
          <div className="p-3">
            <p className="text-sm font-semibold">{selected.label}</p>
            <p className="text-xs text-muted-foreground">{selected.blurb}</p>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {styles.map((s) => {
          const done = looks[s.key];
          const isPending = pending === s.key;
          return (
            <button
              key={s.key}
              type="button"
              disabled={Boolean(pending) || (remaining === 0 && !done)}
              onClick={() => void generate(s)}
              className={cn(
                "relative overflow-hidden rounded-lg border p-2 text-left transition-colors duration-150 active:scale-[0.98] disabled:opacity-60",
                selected?.key === s.key
                  ? "border-primary bg-primary/5"
                  : "border-border bg-surface hover:border-primary/50",
              )}
            >
              {done?.url ? (
                <img
                  src={done.url}
                  alt=""
                  className="mb-1.5 aspect-square w-full rounded-md object-cover"
                />
              ) : (
                <div className="mb-1.5 flex aspect-square w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
                  {isPending ? (
                    <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                </div>
              )}
              <p className="text-xs font-medium leading-tight">{s.label}</p>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Previews are AI renderings for direction, not a promise of the exact result — take them to
        your barber or stylist.
      </p>
    </div>
  );
}

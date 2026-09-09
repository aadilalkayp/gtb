import { useEffect, useRef, useState } from "react";
import { Shirt, Plus, X } from "lucide-react";
import { fetchOutfitChecks, submitOutfitCheck, type OutfitCheck } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge, Button, Spinner } from "@/components/ui";

const VERDICT: Record<
  OutfitCheck["results"][number]["verdict"],
  { label: string; tone: "success" | "info" | "danger" }
> = {
  great: { label: "Great", tone: "success" },
  good: { label: "Works", tone: "info" },
  avoid: { label: "Avoid", tone: "danger" },
};

/**
 * Outfit analysis (Step 3): upload up to three garment photos, get a verdict
 * per garment against your skin tone plus a personal colour palette. Used on
 * the report page (leads) and the portal (clients).
 */
export function OutfitCheckPanel({ scanId }: { scanId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [checks, setChecks] = useState<OutfitCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchOutfitChecks(scanId)
      .then(setChecks)
      .catch(() => setChecks([]));
  }, [scanId]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 3);
    setFiles(next);
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviews(next.map((f) => URL.createObjectURL(f)));
    setError(null);
  };
  const removeAt = (i: number) => {
    const next = files.filter((_, idx) => idx !== i);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async () => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitOutfitCheck({ scanId, garments: files });
      setChecks((c) => [res.check, ...(c ?? [])]);
      setFiles([]);
      setPreviews([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyse those photos.");
    } finally {
      setBusy(false);
    }
  };

  const latest = checks?.[0];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Shirt className="h-5 w-5 text-primary" /> Check an outfit
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Photograph up to three shirts, kurtas or jackets — on a hanger or worn. We judge colour
          against your skin tone and fit if it's on you.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {previews.map((p, i) => (
          <div
            key={p}
            className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border"
          >
            <img src={p} alt={`Garment ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label="Remove"
              onClick={() => removeAt(i)}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/80 text-background"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {files.length < 3 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-surface text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 text-primary" /> Add garment
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button onClick={() => void submit()} disabled={!files.length || busy} className="w-full">
        {busy
          ? "Analysing…"
          : `Analyse ${files.length || ""} ${files.length === 1 ? "garment" : "garments"}`.trim()}
      </Button>

      {checks === null ? (
        <div className="flex justify-center py-4">
          <Spinner className="h-5 w-5" />
        </div>
      ) : latest ? (
        <div className="space-y-4">
          <div className="space-y-3">
            {latest.results.map((r) => {
              const v = VERDICT[r.verdict] ?? VERDICT.good;
              const photo = latest.photos[r.index - 1];
              return (
                <div
                  key={r.index}
                  className="flex gap-3 rounded-lg border border-border bg-surface p-3"
                >
                  {photo && (
                    <img
                      src={photo}
                      alt={`Garment ${r.index}`}
                      className="h-20 w-16 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={v.tone}>{v.label}</Badge>
                      <span className="font-num text-xs text-muted-foreground">{r.score}/100</span>
                    </div>
                    <p className="mt-1.5">{r.colorNote}</p>
                    {r.fitNote && r.fitNote.toLowerCase() !== "fit not visible" && (
                      <p className="mt-0.5 text-muted-foreground">{r.fitNote}</p>
                    )}
                    <p className="mt-1 font-medium text-primary">{r.suggestion}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {latest.palette && (
            <div className="rounded-lg bg-muted/50 p-4 text-sm">
              <p className="font-semibold">Your palette</p>
              <p className="mt-1 text-muted-foreground">{latest.palette.summary}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-success">Try</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {latest.palette.tryColors.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-danger">
                    Avoid near the face
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {latest.palette.avoidColors.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {checks.length > 1 && (
            <p className={cn("text-xs text-muted-foreground")}>
              {checks.length - 1} earlier {checks.length === 2 ? "check" : "checks"} on file.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

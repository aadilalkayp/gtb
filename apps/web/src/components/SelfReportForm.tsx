import { useState } from "react";
import { FITNESS_LEVELS, FITNESS_LEVEL_LABELS, SELF_REPORT_QUESTIONS } from "@gtb/shared";
import { submitSelfReport, type ScanReport, type SelfReportAnswers } from "@/lib/api";
import { Button, Select } from "@/components/ui";

const LIKERT = ["Not at all", "A little", "Somewhat", "Mostly", "Completely"];

/**
 * The 4+4 question self-assessment behind the Fitness and Confidence tiles.
 * Deliberately self-reported: inferring either from a selfie isn't defensible.
 * Every question is optional; the scores derive from whatever is answered.
 */
export function SelfReportForm({
  scanId,
  initial,
  onSaved,
  onCancel,
}: {
  scanId: string;
  initial: SelfReportAnswers | null;
  onSaved: (report: ScanReport) => void;
  onCancel?: () => void;
}) {
  const [answers, setAnswers] = useState<SelfReportAnswers>(initial ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof SelfReportAnswers>(k: K, v: SelfReportAnswers[K]) =>
    setAnswers((a) => ({ ...a, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await submitSelfReport(scanId, answers);
      onSaved(res.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your answers.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold">Fitness habits</h3>
        <div className="mt-3 space-y-4">
          {SELF_REPORT_QUESTIONS.fitness.map((q) => (
            <div key={q.key}>
              <label className="text-sm font-medium" htmlFor={`sr-${q.key}`}>
                {q.label}
              </label>
              {q.kind === "level" ? (
                <Select
                  id={`sr-${q.key}`}
                  className="mt-1.5"
                  value={answers.fitnessLevel ?? ""}
                  onChange={(e) =>
                    set(
                      "fitnessLevel",
                      (e.target.value || undefined) as SelfReportAnswers["fitnessLevel"],
                    )
                  }
                >
                  <option value="">Choose…</option>
                  {FITNESS_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {FITNESS_LEVEL_LABELS[l]}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="mt-1.5 flex items-center gap-3">
                  <input
                    id={`sr-${q.key}`}
                    type="range"
                    min={"min" in q ? q.min : 0}
                    max={"max" in q ? q.max : 10}
                    step={"step" in q ? q.step : 1}
                    value={
                      (answers[q.key as keyof SelfReportAnswers] as number | undefined) ??
                      ("min" in q ? q.min : 0)
                    }
                    onChange={(e) =>
                      set(
                        q.key as "workoutsPerWeek" | "sleepHours" | "waterLitres",
                        Number(e.target.value),
                      )
                    }
                    className="flex-1 accent-primary"
                  />
                  <span className="font-num w-10 text-right text-sm font-semibold">
                    {(answers[q.key as keyof SelfReportAnswers] as number | undefined) ?? "—"}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold">Confidence</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          How true is each statement for you right now?
        </p>
        <div className="mt-3 space-y-4">
          {SELF_REPORT_QUESTIONS.confidence.map((q) => {
            const key = q.key as
              | "photoComfort"
              | "styleConfidence"
              | "routineConsistency"
              | "socialEase";
            const value = answers[key];
            return (
              <div key={q.key}>
                <p className="text-sm font-medium">{q.label}</p>
                <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                  {LIKERT.map((label, i) => {
                    const v = i + 1;
                    const active = value === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => set(key, v)}
                        aria-pressed={active}
                        className={
                          "rounded-lg border px-1 py-2 text-[11px] leading-tight transition-colors duration-150 active:scale-[0.98] " +
                          (active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-surface text-muted-foreground hover:border-primary/50")
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={saving} className="flex-1">
          {saving ? "Saving…" : "Save & update my score"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

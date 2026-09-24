import { Check, Moon } from "lucide-react";
import { exercisePrescription } from "@gtb/shared";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface ChecklistExercise {
  id: string;
  order: number;
  name: string;
  sets: number | null;
  reps: number | null;
  durationSec: number | null;
  equipment: string | null;
  completedAt: Date | string | null;
}

export interface ChecklistDay {
  id: string;
  title: string;
  isRestDay: boolean;
  completedAt: Date | string | null;
  exercises: ChecklistExercise[];
}

/**
 * The day's exercise checklist + "Mark Workout as Complete" (portal and staff
 * fitness detail share it; permissions differ only via canTick).
 */
export function WorkoutChecklist({
  day,
  canTick,
  busy,
  onToggleExercise,
  onToggleDay,
}: {
  day: ChecklistDay;
  canTick: boolean;
  busy?: boolean;
  onToggleExercise: (exercise: ChecklistExercise) => void;
  onToggleDay: () => void;
}) {
  if (day.isRestDay) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-5 text-sm text-muted-foreground">
        <Moon className="h-5 w-5" />
        Rest day. Recovery is part of the program — hydrate and sleep well.
      </div>
    );
  }

  const done = Boolean(day.completedAt);
  const sorted = [...day.exercises].sort((a, b) => a.order - b.order);

  return (
    <div>
      <div className="divide-y divide-border rounded-xl border border-border">
        {sorted.length === 0 && (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            No exercises listed for today.
          </p>
        )}
        {sorted.map((ex) => {
          const ticked = Boolean(ex.completedAt) || done;
          return (
            <label
              key={ex.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-sm",
                canTick && !done ? "cursor-pointer transition-colors hover:bg-muted/50" : "cursor-default",
              )}
            >
              <input
                type="checkbox"
                checked={ticked}
                disabled={!canTick || done || busy}
                onChange={() => onToggleExercise(ex)}
                className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
              />
              <span className={cn("flex-1 font-medium", ticked && "text-muted-foreground line-through")}>
                {ex.name}
              </span>
              <span className="font-num text-sm text-muted-foreground">
                {exercisePrescription(ex)}
              </span>
              {ex.equipment && (
                <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">
                  {ex.equipment}
                </span>
              )}
            </label>
          );
        })}
      </div>
      {canTick && (
        <Button
          className="mt-4 w-full"
          variant={done ? "outline" : "primary"}
          disabled={busy}
          onClick={onToggleDay}
        >
          <Check className="mr-1.5 h-4 w-4" />
          {done ? "Completed — undo" : "Mark Workout as Complete"}
        </Button>
      )}
    </div>
  );
}

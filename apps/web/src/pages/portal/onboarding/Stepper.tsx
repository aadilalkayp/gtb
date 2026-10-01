import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  key: string;
  label: string;
}

/**
 * Horizontal numbered progress indicator for the onboarding wizard.
 * `currentIndex` is the step on screen; steps before `completedThrough` are
 * done and, when `onSelect` is given, clickable so the client can go back
 * and edit them.
 */
export function Stepper({
  steps,
  currentIndex,
  completedThrough = currentIndex,
  onSelect,
}: {
  steps: Step[];
  currentIndex: number;
  completedThrough?: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <ol className="flex items-center">
      {steps.map((step, i) => {
        const done = i < completedThrough && i !== currentIndex;
        const active = i === currentIndex;
        const clickable = Boolean(onSelect) && i < completedThrough && !active;
        const marker = (
          <>
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                done && "bg-primary text-primary-foreground",
                active && "border-2 border-primary text-primary ring-4 ring-ring/15",
                !done && !active && "border border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-sm font-medium sm:inline",
                active ? "text-foreground" : "text-muted-foreground",
                clickable && "underline-offset-4 group-hover:text-foreground group-hover:underline",
              )}
            >
              {step.label}
            </span>
          </>
        );
        return (
          <li
            key={step.key}
            className="flex flex-1 items-center last:flex-none"
            aria-current={active ? "step" : undefined}
          >
            {clickable ? (
              <button
                type="button"
                onClick={() => onSelect?.(i)}
                className="group flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label={`Go back to ${step.label}`}
              >
                {marker}
              </button>
            ) : (
              <div className="flex items-center gap-2">{marker}</div>
            )}
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "mx-3 h-px flex-1 transition-colors",
                  i < completedThrough - 1 ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

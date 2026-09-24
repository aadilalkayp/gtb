import { Check, Minus, Moon, X } from "lucide-react";
import { weekStrip, type WeekStripEntry, type WorkoutDayLite } from "@gtb/shared";
import { cn } from "@/lib/utils";

/**
 * Mon–Sun completion strip for the current week (both portals + roster cards).
 * Completed=check, missed=cross, rest=moon, upcoming/none=dash.
 */
export function WeekStrip({
  days,
  size = "md",
  className,
}: {
  days: WorkoutDayLite[];
  size?: "sm" | "md";
  className?: string;
}) {
  const strip = weekStrip(days);
  return (
    <div className={cn("flex items-center gap-1.5", size === "md" && "gap-2", className)}>
      {strip.map((entry) => (
        <div key={entry.weekdayLabel} className="flex flex-col items-center gap-1">
          {size === "md" && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {entry.weekdayLabel}
            </span>
          )}
          <DayDot entry={entry} size={size} />
        </div>
      ))}
    </div>
  );
}

function DayDot({ entry, size }: { entry: WeekStripEntry; size: "sm" | "md" }) {
  const dim = size === "sm" ? "h-5 w-5" : "h-8 w-8";
  const icon = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  switch (entry.state) {
    case "completed":
      return (
        <span className={cn(dim, "flex items-center justify-center rounded-full bg-success text-white")}>
          <Check className={icon} strokeWidth={3} />
        </span>
      );
    case "missed":
      return (
        <span className={cn(dim, "flex items-center justify-center rounded-full bg-danger text-white")}>
          <X className={icon} strokeWidth={3} />
        </span>
      );
    case "rest":
      return (
        <span className={cn(dim, "flex items-center justify-center rounded-full bg-muted text-muted-foreground")}>
          <Moon className={icon} />
        </span>
      );
    case "today":
      return (
        <span
          className={cn(
            dim,
            "flex items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-primary",
          )}
        >
          <Minus className={icon} />
        </span>
      );
    default:
      return (
        <span className={cn(dim, "flex items-center justify-center rounded-full bg-muted text-muted-foreground/60")}>
          <Minus className={icon} />
        </span>
      );
  }
}

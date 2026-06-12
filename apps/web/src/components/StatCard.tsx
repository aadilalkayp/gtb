import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const accents = {
  primary: "bg-primary/10 text-primary",
  groom: "bg-groom/10 text-groom",
  bride: "bg-bride/10 text-bride",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-[hsl(35_92%_38%)]",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
} as const;

export type StatAccent = keyof typeof accents;

/** Dashboard stat tile: icon chip, big value, label, optional delta/footnote. */
export function StatCard({
  icon: Icon,
  label,
  value,
  accent = "primary",
  delta,
  footnote,
  onClick,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  accent?: StatAccent;
  /** Positive → green up arrow, negative → red down arrow. */
  delta?: { value: string; positive: boolean };
  footnote?: string;
  onClick?: () => void;
  className?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "card p-4 text-left",
        onClick && "transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn("flex h-9 w-9 items-center justify-center rounded-lg", accents[accent])}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {delta && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
              delta.positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
            )}
          >
            {delta.positive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta.value}
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
      {footnote && <p className="mt-1 text-xs text-muted-foreground/80">{footnote}</p>}
    </Comp>
  );
}

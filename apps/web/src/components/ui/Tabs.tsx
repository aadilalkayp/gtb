import { cn } from "@/lib/utils";

export interface TabDef<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

/** Underline-style tab bar used across staff modules. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-border", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            active === t.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                active === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Pill-style filter row (e.g. status filters). */
export function PillFilter<T extends string>({
  options,
  active,
  onChange,
  className,
}: {
  options: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full px-3 py-1 text-sm font-medium transition-colors",
            active === o.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

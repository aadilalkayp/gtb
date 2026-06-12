import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only star display (supports halves via rounding). */
export function RatingStars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i <= Math.round(value) ? "fill-warning text-warning" : "text-border",
          )}
        />
      ))}
    </span>
  );
}

/** Interactive star picker (1–5). */
export function RatingInput({
  value,
  onChange,
  size = "md",
}: {
  value: number | null;
  onChange: (v: number) => void;
  size?: "md" | "lg";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const active = hover ?? value ?? 0;
  const px = size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <div className="inline-flex items-center gap-1" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          className="transition-transform hover:scale-110"
        >
          <Star className={cn(px, i <= active ? "fill-warning text-warning" : "text-border")} />
        </button>
      ))}
    </div>
  );
}

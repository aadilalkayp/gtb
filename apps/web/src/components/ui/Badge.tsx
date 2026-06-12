import { cn } from "@/lib/utils";
import { humanize } from "@gtb/shared";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-[hsl(35_92%_38%)]",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Maps a domain status value to a tone + humanized label. */
const STATUS_TONES: Record<string, Tone> = {
  // client / session / generic
  active: "success",
  completed: "info",
  converted: "success",
  scheduled: "info",
  upcoming: "info",
  in_progress: "warning",
  on_hold: "warning",
  pending: "warning",
  proof_submitted: "warning",
  delayed: "warning",
  lead: "neutral",
  cancelled: "neutral",
  missed: "danger",
  overdue: "danger",
  rejected: "danger",
  // payments
  paid: "success",
  approved: "success",
  partially_paid: "warning",
  waived: "neutral",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONES[status] ?? "neutral";
  return (
    <Badge tone={tone} className={className}>
      {humanize(status)}
    </Badge>
  );
}

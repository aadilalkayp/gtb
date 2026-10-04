import { NavLink } from "react-router-dom";
import {
  CalendarCheck,
  Dumbbell,
  Eye,
  FileDown,
  FileText,
  IndianRupee,
  ListTodo,
  LogIn,
  LogOut,
  Megaphone,
  Pencil,
  PhoneCall,
  Receipt,
  Scissors,
  Settings,
  Trash2,
  Upload,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  ACTIVITY_MODULE_LABELS,
  addWorkDays,
  isActivityModule,
  STAFF_ROLE_LABELS,
  workDayClockMinutes,
  workDayKey,
  type ActivityTone,
} from "@gtb/shared";
import { cn } from "@/lib/utils";
import type { Block, PulseMetric } from "./pulseApi";

// ---------------------------------------------------------------------------
// Dates (IST work days)
// ---------------------------------------------------------------------------

const IST = "Asia/Kolkata";
const noonOf = (day: string) => new Date(`${day}T12:00:00+05:30`);

export function todayKey(): string {
  return workDayKey(new Date());
}

/** "Thu, 2 Oct" */
export function dayLabel(day: string, opts: { year?: boolean } = {}): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(opts.year ? { year: "numeric" } : {}),
    timeZone: IST,
  }).format(noonOf(day));
}

/** "9:41 am" */
export function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST })
    .format(new Date(iso))
    .toLowerCase();
}

/** Monday-to-Sunday week containing `day`. */
export function weekOf(day: string): { from: string; to: string } {
  const dow = (noonOf(day).getUTCDay() + 6) % 7; // Monday = 0
  const from = addWorkDays(day, -dow);
  return { from, to: addWorkDays(from, 6) };
}

/** Calendar month containing `day`. */
export function monthOf(day: string): { from: string; to: string } {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function rangeLabel(from: string, to: string): string {
  if (from === to) return dayLabel(from, { year: true });
  const f = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: IST });
  return `${f.format(noonOf(from))} to ${f.format(noonOf(to))}`;
}

export function roleLabel(role: string): string {
  return (STAFF_ROLE_LABELS as Record<string, string>)[role] ?? role;
}

export function moduleLabel(module: string | null | undefined): string {
  return module && isActivityModule(module) ? ACTIVITY_MODULE_LABELS[module] : "Other";
}

// ---------------------------------------------------------------------------
// Tones and icons
// ---------------------------------------------------------------------------

export const TONE_CHIP: Record<ActivityTone, string> = {
  routine: "bg-primary/10 text-primary",
  correction: "bg-warning/10 text-warning",
  sensitive: "bg-danger/10 text-danger",
  neutral: "bg-muted text-muted-foreground",
};

export const TONE_TICK: Record<ActivityTone, string> = {
  routine: "bg-primary",
  correction: "bg-warning",
  sensitive: "bg-danger",
  neutral: "bg-muted-foreground/50",
};

export function activityIcon(verb: string | null): LucideIcon {
  const v = verb ?? "";
  if (v === "auth.signed_in") return LogIn;
  if (v === "auth.signed_out") return LogOut;
  if (v === "client.viewed") return Eye;
  if (v === "document.downloaded") return FileText;
  if (v === "document.uploaded") return Upload;
  if (v === "report.exported") return FileDown;
  if (v.endsWith(".deleted")) return Trash2;
  if (v.startsWith("payment")) return IndianRupee;
  if (v.startsWith("followup") || v.startsWith("followUp")) return PhoneCall;
  if (v.startsWith("session")) return CalendarCheck;
  if (v.startsWith("task")) return ListTodo;
  if (v.startsWith("content")) return Megaphone;
  if (v.startsWith("styling")) return Scissors;
  if (v.startsWith("fitness")) return Dumbbell;
  if (v.startsWith("expense")) return Receipt;
  if (v.startsWith("settings")) return Settings;
  if (v.startsWith("client")) return UserRound;
  return Pencil;
}

// ---------------------------------------------------------------------------
// Time axis + day bar
// ---------------------------------------------------------------------------

/** Clock-minute range a timeline shows: at least 8 am to 8 pm, widened to fit. */
export function axisFor(instants: string[]): { start: number; end: number } {
  let start = 8 * 60;
  let end = 20 * 60;
  for (const iso of instants) {
    const m = workDayClockMinutes(new Date(iso));
    start = Math.min(start, Math.floor(m / 60) * 60);
    end = Math.max(end, Math.ceil(m / 60) * 60);
  }
  return { start, end };
}

export function axisPct(iso: string, axis: { start: number; end: number }): number {
  const m = workDayClockMinutes(new Date(iso));
  return Math.min(100, Math.max(0, ((m - axis.start) / (axis.end - axis.start)) * 100));
}

export function AxisLabels({ axis, className }: { axis: { start: number; end: number }; className?: string }) {
  const hours: number[] = [];
  const step = axis.end - axis.start > 14 * 60 ? 4 : 2;
  for (let h = axis.start / 60; h <= axis.end / 60; h += step) hours.push(h);
  return (
    <div className={cn("relative h-4 text-[11px] text-muted-foreground font-num", className)}>
      {hours.map((h) => (
        <span
          key={h}
          className="absolute -translate-x-1/2"
          style={{ left: `${(((h * 60 - axis.start) / (axis.end - axis.start)) * 100).toFixed(2)}%` }}
        >
          {h % 24 === 0 ? "12a" : h % 24 === 12 ? "12p" : h % 24 > 12 ? `${(h % 24) - 12}p` : `${h % 24}a`}
        </span>
      ))}
    </div>
  );
}

/** Active blocks on a thin track, with the first-to-last span shaded behind. */
export function DayBar({
  blocks,
  span,
  axis,
  className,
}: {
  blocks: Block[];
  span?: [string, string] | null;
  axis: { start: number; end: number };
  className?: string;
}) {
  return (
    <div className={cn("relative h-2 overflow-hidden rounded-full bg-muted", className)}>
      {span && (
        <span
          className="absolute inset-y-0 bg-primary/10"
          style={{ left: `${axisPct(span[0], axis)}%`, right: `${100 - axisPct(span[1], axis)}%` }}
        />
      )}
      {blocks.map(([s, e]) => (
        <span
          key={s}
          className="absolute inset-y-0 rounded-full bg-primary/70"
          style={{ left: `${axisPct(s, axis)}%`, width: `${Math.max(0.6, axisPct(e, axis) - axisPct(s, axis))}%` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

export function PulseTabs() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150",
      isActive
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground",
    );
  return (
    <nav className="mt-6 flex gap-1 border-b border-border">
      <NavLink to="/team-pulse" end className={tab}>
        Overview
      </NavLink>
      <NavLink to="/team-pulse/activity" className={tab}>
        All activity
      </NavLink>
    </nav>
  );
}

export function MetricList({ metrics, empty }: { metrics: PulseMetric[]; empty: string }) {
  if (metrics.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <dl className="divide-y divide-border">
      {metrics.map((m) => (
        <div key={m.key} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-sm text-muted-foreground">{m.label}</dt>
          <dd className="text-right">
            <span className="font-num text-sm font-semibold">{m.value}</span>
            {m.hint && <span className="font-num ml-2 text-xs text-muted-foreground">{m.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PresenceDot({ state }: { state: "active" | "idle" }) {
  return (
    <span className="relative flex h-2 w-2">
      {state === "active" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/50 motion-reduce:animate-none" />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", state === "active" ? "bg-success" : "bg-warning")} />
    </span>
  );
}

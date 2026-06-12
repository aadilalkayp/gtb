import { Link } from "react-router-dom";
import { Scissors, MapPin, Plane, CheckCircle2, Circle, ArrowRight, Sparkles } from "lucide-react";
import { useFindManyStylingOperation } from "@gtb/db/hooks";
import { formatDate, daysUntil } from "@gtb/shared";

interface StylingOpRow {
  id: string;
  stylingDate: string | Date | null;
  stylingLocation: string | null;
  travelRequired: boolean;
  status: string;
  consultationDone: boolean;
  outfitFinalized: boolean;
  accessoriesFinalized: boolean;
  guideDelivered: boolean;
}

/** Client-facing milestones only — the internal `finalConfirmation` sign-off is hidden. */
const MILESTONES = [
  { key: "consultationDone", label: "Styling consultation" },
  { key: "outfitFinalized", label: "Outfit finalized" },
  { key: "accessoriesFinalized", label: "Accessories finalized" },
  { key: "guideDelivered", label: "Styling guide ready" },
] as const;

/**
 * Read-only "Your styling day" card for the client portal. Renders nothing until
 * staff create a styling operation for the client. Read access is already granted
 * by the StylingOperation policy (`client.userId == auth().id`) — no schema change.
 */
export function StylingDayCard({ clientId }: { clientId: string }) {
  const { data } = useFindManyStylingOperation({
    where: { clientId },
    orderBy: { stylingDate: "asc" },
  });
  const ops = (data ?? []) as unknown as StylingOpRow[];
  // Show the soonest operation that isn't finished yet, else the most recent.
  const op = ops.find((o) => o.status !== "completed") ?? ops[ops.length - 1];
  if (!op) return null;

  const done = MILESTONES.filter((m) => op[m.key]).length;
  const days = op.stylingDate ? daysUntil(op.stylingDate) : null;
  const allSet = op.status === "completed";

  return (
    <section className="card overflow-hidden p-0">
      {/* Header */}
      <div className="relative bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground">
        <Scissors className="absolute -right-4 -top-4 h-24 w-24 rotate-12 opacity-10" />
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Your styling day</p>
          {allSet && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
              <Sparkles className="h-3 w-3" /> All set
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="text-2xl font-bold tracking-tight">
            {op.stylingDate ? formatDate(op.stylingDate) : "Date to be confirmed"}
          </p>
          {days != null && days >= 0 && (
            <span className="pb-0.5 text-sm opacity-80">
              {days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}
            </span>
          )}
        </div>
        {(op.stylingLocation || op.travelRequired) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm opacity-90">
            {op.stylingLocation && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {op.stylingLocation}
              </span>
            )}
            {op.travelRequired && (
              <span className="flex items-center gap-1.5">
                <Plane className="h-4 w-4" /> Your stylist comes to you
              </span>
            )}
          </div>
        )}
      </div>

      {/* Progress + milestones */}
      <div className="p-5">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Getting you ready</span>
          <span className="font-medium">
            {done}/{MILESTONES.length}
          </span>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(done / MILESTONES.length) * 100}%` }}
          />
        </div>
        <ul className="space-y-2.5">
          {MILESTONES.map((m) => {
            const complete = Boolean(op[m.key]);
            return (
              <li key={m.key} className="flex items-center gap-2.5 text-sm">
                {complete ? (
                  <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-success" />
                ) : (
                  <Circle className="h-[18px] w-[18px] shrink-0 text-muted-foreground/30" />
                )}
                <span className={complete ? "font-medium" : "text-muted-foreground"}>{m.label}</span>
              </li>
            );
          })}
        </ul>
        {op.guideDelivered && (
          <Link
            to="/portal/documents"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View your styling guide <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}

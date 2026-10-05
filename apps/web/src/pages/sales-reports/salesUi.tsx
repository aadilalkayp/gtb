import { formatINR, SALES_REPORT_COUNT_FIELDS, SALES_REPORT_STATUS_LABELS, type SalesReportStatus } from "@gtb/shared";
import { Badge, type Tone } from "@/components/ui";
import { dayLabel, timeLabel } from "../team-pulse/pulseUi";
import type { SalesDayCell, SalesFigures } from "./salesApi";

const STATUS_TONES: Record<SalesReportStatus, Tone> = {
  submitted: "success",
  late: "warning",
  day_off: "neutral",
  pending: "info",
  missed: "danger",
};

export function SalesStatusBadge({ status }: { status: SalesReportStatus | null }) {
  if (!status) return <span className="text-muted-foreground">–</span>;
  return <Badge tone={STATUS_TONES[status]}>{SALES_REPORT_STATUS_LABELS[status]}</Badge>;
}

/** "9:41 pm, Thu 1 Oct", with "(edited 10:02 pm)" when changed later. */
export function submittedLabel(cell: SalesDayCell): string | null {
  const r = cell.report;
  if (!r) return null;
  const at = `${timeLabel(r.submittedAt)}, ${dayLabel(istDateOf(r.submittedAt))}`;
  return r.editedAt ? `${at} (edited ${timeLabel(r.editedAt)})` : at;
}

/** The IST calendar date of an instant, for labels. */
function istDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

export function salesLabel(f: SalesFigures): string {
  if (f.sales === 0) return "0";
  const value = f.salesValue > 0 ? ` · ${formatINR(f.salesValue)}` : "";
  const pending = f.pricePending > 0 ? ` (${f.pricePending} price pending)` : "";
  return `${f.sales}${value}${pending}`;
}

/** A pair like "12 / 3": what the CRO reported, then what GTB OS recorded. */
export function Pair({ left, right, rightHint }: { left: number | null; right: number | null; rightHint?: string }) {
  return (
    <span className="font-num whitespace-nowrap">
      <span className="font-semibold text-foreground">{left ?? "–"}</span>
      <span className="text-muted-foreground"> / </span>
      <span className="text-muted-foreground" title={rightHint}>
        {right ?? "–"}
      </span>
    </span>
  );
}

/** Full report: what the CRO reported and what GTB OS recorded. */
export function ReportDetail({ cell }: { cell: SalesDayCell }) {
  const r = cell.report;
  const f = cell.figures;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <SalesStatusBadge status={cell.status} />
        {r && <span className="text-muted-foreground">Submitted {submittedLabel(cell)}</span>}
      </div>

      {r?.dayOff ? (
        <p className="text-sm text-muted-foreground">Marked as a day off.</p>
      ) : r ? (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Reported</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {SALES_REPORT_COUNT_FIELDS.map((field) => (
              <div key={field.key}>
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd className="font-num mt-0.5 text-base font-semibold">{r[field.key] ?? "–"}</dd>
              </div>
            ))}
          </dl>
          {cell.plannedYesterday !== null && (
            <p className="mt-3 text-xs text-muted-foreground">
              Planned yesterday for today: <span className="font-num">{cell.plannedYesterday}</span> follow-ups.
            </p>
          )}
          <div className="mt-4">
            <h4 className="text-sm text-muted-foreground">Challenges or support needed</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm">{r.challenges || "None"}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No report filed.</p>
      )}

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Recorded in GTB OS</h3>
        <FiguresList figures={f} />
      </div>
    </div>
  );
}

export function FiguresList({ figures: f }: { figures: SalesFigures }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
      <div>
        <dt className="text-muted-foreground">Leads added</dt>
        <dd className="font-num mt-0.5 text-base font-semibold">{f.leadsAdded}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Confirmed sales</dt>
        <dd className="font-num mt-0.5 text-base font-semibold">{salesLabel(f)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Payments received</dt>
        <dd className="font-num mt-0.5 text-base font-semibold">
          {formatINR(f.paymentsReceived)}
          {f.payments > 0 && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({f.payments} payment{f.payments === 1 ? "" : "s"})
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
}

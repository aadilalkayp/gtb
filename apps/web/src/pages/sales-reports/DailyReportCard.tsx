import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardPen } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMySalesReports } from "./salesApi";

const time = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    .format(new Date(iso))
    .toLowerCase();

/** CRO dashboard nudge for the daily sales report (SALES_REPORTS_DESIGN.md §9). */
export function DailyReportCard() {
  const { data } = useMySalesReports();
  const navigate = useNavigate();
  if (!data) return null;
  const today = data.days.find((d) => d.day === data.today);
  const yesterdayMissed = data.days.find((d) => d.day === data.yesterday)?.status === "missed";
  const report = today?.report;

  const [tone, Icon, text, action] = report
    ? ([
        "success",
        CheckCircle2,
        report.dayOff
          ? "Today is marked as a day off."
          : `Today's report is in (submitted at ${time(report.submittedAt)}). You can edit it until 4:00 am.`,
        "View report",
      ] as const)
    : yesterdayMissed
      ? (["warning", AlertTriangle, "Yesterday's report is missing. File it now (it will be marked late).", "File report"] as const)
      : (["info", ClipboardPen, "Today's report is not in yet. Fill it in before you sign off.", "Fill in report"] as const);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3 text-sm",
        tone === "success" && "border-success/25 bg-success/10",
        tone === "warning" && "border-warning/30 bg-warning/10",
        tone === "info" && "border-info/25 bg-info/10",
      )}
    >
      <span className="flex items-center gap-2">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "info" && "text-info",
          )}
        />
        {text}
      </span>
      <Button size="sm" variant={report ? "ghost" : "primary"} onClick={() => navigate("/daily-report")}>
        {action}
      </Button>
    </div>
  );
}

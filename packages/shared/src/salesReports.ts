/**
 * CRO daily sales reports (SALES_REPORTS_DESIGN.md): the self-reported fields,
 * their limits and labels, shared by the API (validation, CSV) and the web
 * form so every CRO counts the same way.
 */

export const SALES_REPORT_COUNT_FIELDS = [
  {
    key: "enquiries",
    label: "New enquiries handled",
    short: "Enquiries",
    help: "New people you spoke to today, from any channel (WhatsApp, Instagram, calls, walk-ins).",
  },
  {
    key: "leadFollowUps",
    label: "Lead follow-ups done",
    short: "Follow-ups",
    help: "Follow-ups with leads who have not paid yet. Client check-ins are tracked in CRO Tracking.",
  },
  {
    key: "hotLeads",
    label: "Hot leads",
    short: "Hot leads",
    help: "Leads who are seriously interested and likely to pay soon.",
  },
  {
    key: "plannedFollowUps",
    label: "Follow-ups planned for tomorrow",
    short: "Planned",
    help: "How many lead follow-ups you plan to do tomorrow.",
  },
] as const;

export type SalesReportCountKey = (typeof SALES_REPORT_COUNT_FIELDS)[number]["key"];

export const SALES_REPORT_MAX_COUNT = 999;
export const SALES_REPORT_MAX_CHALLENGES = 2000;

/**
 * Submitted / Late / Day off are reports that exist; Pending is today without
 * one; Missed is a past day without one.
 */
export type SalesReportStatus = "submitted" | "late" | "day_off" | "pending" | "missed";

export const SALES_REPORT_STATUS_LABELS: Record<SalesReportStatus, string> = {
  submitted: "Submitted",
  late: "Late",
  day_off: "Day off",
  pending: "Pending",
  missed: "Missed",
};

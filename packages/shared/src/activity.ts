/**
 * Team Pulse activity vocabulary (TEAM_PULSE_DESIGN.md §5.4, §5.6), shared by the
 * server (capture, heartbeat) and the founder UI (rendering).
 *
 * - MODULES: the app areas activity is attributed to.
 * - moduleForPath / moduleForModel: route or entity type -> module.
 * - deriveVerb: turns a captured database write into a meaningful verb, so a
 *   gateway diff like FollowUp.status pending -> completed reads as
 *   "followup.completed".
 */

export const ACTIVITY_MODULES = [
  "dashboard",
  "clients",
  "consultations",
  "styling",
  "fitness",
  "payments",
  "cro",
  "tasks",
  "documents",
  "expenses",
  "assignments",
  "media",
  "reports",
  "alerts",
  "settings",
  "other",
] as const;
export type ActivityModule = (typeof ACTIVITY_MODULES)[number];

export const ACTIVITY_MODULE_LABELS: Record<ActivityModule, string> = {
  dashboard: "Dashboard",
  clients: "Clients",
  consultations: "Consultations",
  styling: "Styling",
  fitness: "Fitness",
  payments: "Payments",
  cro: "CRO",
  tasks: "Tasks",
  documents: "Documents",
  expenses: "Expenses",
  assignments: "Assignments",
  media: "Media",
  reports: "Reports",
  alerts: "Alerts",
  settings: "Settings",
  other: "Other",
};

export function isActivityModule(value: unknown): value is ActivityModule {
  return typeof value === "string" && (ACTIVITY_MODULES as readonly string[]).includes(value);
}

/** Staff route prefix -> module. Longest prefix wins, so order does not matter. */
const PATH_MODULES: Array<[string, ActivityModule]> = [
  ["/dashboard", "dashboard"],
  ["/clients", "clients"],
  ["/consultations", "consultations"],
  ["/styling-operations", "styling"],
  ["/fitness", "fitness"],
  ["/messages", "styling"],
  ["/payments", "payments"],
  ["/cro-tracking", "cro"],
  ["/daily-report", "cro"],
  ["/sales-reports", "reports"],
  ["/team-tasks", "tasks"],
  ["/documents", "documents"],
  ["/expenses", "expenses"],
  ["/assignments", "assignments"],
  ["/media", "media"],
  ["/reports", "reports"],
  ["/alerts", "alerts"],
  ["/settings", "settings"],
];

export function moduleForPath(pathname: string): ActivityModule {
  let best: [string, ActivityModule] | undefined;
  for (const entry of PATH_MODULES) {
    const [prefix] = entry;
    if ((pathname === prefix || pathname.startsWith(`${prefix}/`)) && (!best || prefix.length > best[0].length)) {
      best = entry;
    }
  }
  return best?.[1] ?? "other";
}

/** Prisma model name -> module. */
const MODEL_MODULES: Record<string, ActivityModule> = {
  Client: "clients",
  Assessment: "clients",
  Assignment: "assignments",
  ClientPlan: "payments",
  PaymentMilestone: "payments",
  Payment: "payments",
  Session: "consultations",
  FollowUp: "cro",
  SalesReport: "cro",
  StylingOperation: "styling",
  StylingBlueprint: "styling",
  StylingPhoto: "styling",
  StylingLook: "styling",
  StylingPalette: "styling",
  StylingItem: "styling",
  StylingEssential: "styling",
  StylingBlueprintVersion: "styling",
  StylingLibraryItem: "styling",
  // Only the styling channel is open; new chat kinds may need their own module.
  Conversation: "styling",
  Message: "styling",
  Document: "documents",
  Expense: "expenses",
  ContentItem: "media",
  Task: "tasks",
  FitnessPlan: "fitness",
  FitnessWorkoutDay: "fitness",
  FitnessExercise: "fitness",
  FitnessCheckIn: "fitness",
  WeightLog: "fitness",
  BodyMeasurement: "fitness",
  TrainerNote: "fitness",
  User: "settings",
  Plan: "settings",
  PlanService: "settings",
  LeadSource: "settings",
  ExpenseCategory: "settings",
  ConsultantRate: "settings",
  CoachArticle: "settings",
};

export function moduleForModel(model: string): ActivityModule {
  return MODEL_MODULES[model] ?? "other";
}

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

/** Field-level diff as stored on ActivityLog.changes: { field: [before, after] }. */
export type FieldChanges = Record<string, [unknown, unknown]>;
export type WriteOp = "create" | "update" | "delete";

const SETTINGS_MODELS = new Set([
  "User",
  "Plan",
  "PlanService",
  "LeadSource",
  "ExpenseCategory",
  "ConsultantRate",
  "CoachArticle",
]);

const STYLING_CHECKLIST_FIELDS = new Set([
  "consultationDoneAt",
  "outfitFinalizedAt",
  "accessoriesFinalizedAt",
  "guideDeliveredAt",
  "finalConfirmationAt",
]);

function changedTo(changes: FieldChanges, field: string, value: unknown): boolean {
  const c = changes[field];
  return c !== undefined && c[1] === value && c[0] !== value;
}

/** Lowercase-first model name used in generic verbs: "FollowUp" -> "followUp". */
function verbNoun(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * The verb for a captured write. Rules are deliberately few and readable; any
 * write they do not recognise falls back to "<model>.created|updated|deleted".
 */
export function deriveVerb(model: string, op: WriteOp, changes: FieldChanges): string {
  if (SETTINGS_MODELS.has(model)) return "settings.changed";

  switch (model) {
    case "FollowUp":
      if (op === "create") return "followup.scheduled";
      if (changedTo(changes, "status", "completed")) return "followup.completed";
      break;
    case "Task":
      if (op === "create") return "task.created";
      if (changedTo(changes, "status", "completed")) return "task.completed";
      break;
    case "ContentItem":
      if (op === "create") return "content.created";
      if (changedTo(changes, "status", "posted")) return "content.posted";
      if (changes.status) return "content.moved";
      break;
    case "StylingOperation": {
      if (op !== "update") break;
      const ticked = Object.keys(changes).filter((f) => STYLING_CHECKLIST_FIELDS.has(f));
      if (ticked.length > 0) {
        const anySet = ticked.some((f) => changes[f]?.[1] != null);
        return anySet ? "styling.item_done" : "styling.item_undone";
      }
      break;
    }
    case "StylingBlueprint":
      if (op === "update" && changedTo(changes, "status", "published")) return "styling.blueprint_published";
      if (op === "update" && changedTo(changes, "status", "retake_requested")) return "styling.retake_requested";
      if (op === "update") return "styling.blueprint_edited";
      break;
    case "StylingLook":
    case "StylingPalette":
    case "StylingItem":
    case "StylingEssential":
      return "styling.blueprint_edited";
    case "StylingLibraryItem":
      return "styling.library_edited";
    case "Message":
      if (op === "create") return "chat.message_sent";
      return "chat.message_updated";
    case "Conversation":
      return "chat.conversation_updated";
    case "Client":
      if (op === "create") return "client.created";
      if (changes.status) return "client.status_changed";
      if (op === "update") return "client.updated";
      break;
    case "Assignment":
      if (op === "create") return "client.assigned";
      break;
    case "Expense":
      if (op === "create") return "expense.submitted";
      if (changedTo(changes, "status", "approved")) return "expense.approved";
      if (changedTo(changes, "status", "rejected")) return "expense.rejected";
      break;
    case "WeightLog":
      if (op === "create") return "fitness.weight_logged";
      break;
    case "BodyMeasurement":
      if (op === "create") return "fitness.measurements_logged";
      break;
    case "FitnessCheckIn":
      if (changes.trainerComment && changes.trainerComment[1]) return "fitness.checkin_reviewed";
      break;
    case "TrainerNote":
      if (op === "create") return "fitness.note_added";
      break;
    case "FitnessPlan":
    case "FitnessWorkoutDay":
    case "FitnessExercise":
      return "fitness.plan_edited";
    case "Document":
      if (op === "create") return "document.uploaded";
      break;
    case "SalesReport":
      if (changedTo(changes, "dayOff", true) || (op === "create" && changes.dayOff?.[1] === true)) {
        return "salesreport.day_off";
      }
      if (op === "create") return "salesreport.submitted";
      if (op === "update") return "salesreport.edited";
      break;
  }
  return `${verbNoun(model)}.${op === "create" ? "created" : op === "delete" ? "deleted" : "updated"}`;
}

// ---------------------------------------------------------------------------
// Browser-sent events (POST /api/events): the only verbs a client may send.
// ---------------------------------------------------------------------------

export const CLIENT_EVENT_VERBS = ["client.viewed", "report.exported", "auth.signed_out"] as const;
export type ClientEventVerb = (typeof CLIENT_EVENT_VERBS)[number];

export function isClientEventVerb(value: unknown): value is ClientEventVerb {
  return typeof value === "string" && (CLIENT_EVENT_VERBS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Work day (IST, 4 am boundary)
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_START_HOUR_IST = 4;

/**
 * The IST work day an instant belongs to, as "YYYY-MM-DD". Activity before
 * 4:00 am IST counts toward the previous day, so a late night reads as one long
 * day rather than two.
 */
export function workDayKey(at: Date): string {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS - DAY_START_HOUR_IST * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WORK_DAY_START_OFFSET_MS = DAY_START_HOUR_IST * 60 * 60 * 1000 - IST_OFFSET_MS;

/** The UTC instants a work day spans: [4:00 am IST, next 4:00 am IST). */
export function workDayWindow(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const start = new Date(Date.UTC(y, m - 1, d) + WORK_DAY_START_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** "YYYY-MM-DD" work-day keys from `from` to `to`, inclusive. */
export function workDayRange(from: string, to: string): string[] {
  const out: string[] = [];
  const end = workDayWindow(to).start.getTime();
  for (let t = workDayWindow(from).start.getTime(); t <= end && out.length < 400; t += DAY_MS) {
    out.push(new Date(t - WORK_DAY_START_OFFSET_MS).toISOString().slice(0, 10));
  }
  return out;
}

/** Shift a work-day key by whole days. */
export function addWorkDays(day: string, n: number): string {
  return new Date(workDayWindow(day).start.getTime() - WORK_DAY_START_OFFSET_MS + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Minutes after IST midnight of the instant's work day: 9:41 am = 581,
 * 1:00 am the next night = 1500. Averages of start/end times use this so a
 * late night does not average out to mid-afternoon.
 */
export function workDayClockMinutes(at: Date): number {
  const sinceStart = at.getTime() - workDayWindow(workDayKey(at)).start.getTime();
  return Math.round(sinceStart / 60_000) + DAY_START_HOUR_IST * 60;
}

/** 581 -> "9:41 am"; 1500 -> "1:00 am". */
export function formatClockMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "am" : "pm"}`;
}

/** 290 -> "4h 50m"; 40 -> "40m"; 0 -> "0m". */
export function formatDurationMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Sentence catalog (TEAM_PULSE_DESIGN.md §5.4): one place that turns an
// ActivityLog row into words, shared by the founder UI and the CSV export.
// ---------------------------------------------------------------------------

/**
 * routine: everyday work. correction: edits, reversals, rejections.
 * sensitive: deletions, voids, cancellations, exports. neutral: views and
 * presence.
 */
export type ActivityTone = "routine" | "correction" | "sensitive" | "neutral";

export interface ActivityDescribeInput {
  verb: string | null;
  kind: string;
  entityType: string;
  summary?: string | null;
  changes?: unknown;
  meta?: unknown;
}

export interface ActivityDescription {
  /** Sentence with an optional `{client}` placeholder for the client's name. */
  template: string;
  tone: ActivityTone;
  /** Secondary line: amounts, reasons, what changed. */
  detail?: string;
}

const CATALOG: Record<string, [string, ActivityTone]> = {
  "followup.scheduled": ["Scheduled a follow-up with {client}", "routine"],
  "followup.completed": ["Completed a follow-up with {client}", "routine"],
  "task.created": ["Created a task", "routine"],
  "task.completed": ["Completed a task", "routine"],
  "content.created": ["Added a content item", "routine"],
  "content.moved": ["Moved a content item", "routine"],
  "content.posted": ["Marked a content item as posted", "routine"],
  "styling.item_done": ["Ticked a styling checklist item for {client}", "routine"],
  "styling.item_undone": ["Unticked a styling checklist item for {client}", "correction"],
  "styling.blueprint_edited": ["Worked on {client}'s Styling Blueprint", "routine"],
  "styling.blueprint_published": ["Published {client}'s Styling Blueprint", "routine"],
  "styling.retake_requested": ["Asked {client} to retake a photo", "routine"],
  "styling.library_edited": ["Edited the styling library", "routine"],
  "chat.message_sent": ["Sent a message to {client}", "routine"],
  "chat.message_updated": ["Updated a chat message with {client}", "neutral"],
  "chat.conversation_updated": ["Chat with {client} updated", "neutral"],
  "client.created": ["Added {client} as a lead", "routine"],
  "client.status_changed": ["Changed {client}'s status", "correction"],
  "client.updated": ["Updated {client}'s profile", "routine"],
  "client.assigned": ["Assigned staff to {client}", "routine"],
  "client.converted": ["Converted {client}", "routine"],
  "client.activated": ["Activated {client}", "routine"],
  "client.enrolled": ["Enrolled {client} in a plan", "routine"],
  "client.plan_changed": ["Changed {client}'s plan", "correction"],
  "client.cancelled": ["Cancelled {client}", "sensitive"],
  "client.completed": ["Completed {client}'s program", "routine"],
  "client.deleted": ["Deleted a lead", "sensitive"],
  "client.wedding_date_changed": ["Changed {client}'s big day date", "correction"],
  "expense.submitted": ["Submitted an expense", "routine"],
  "expense.approved": ["Approved an expense", "routine"],
  "expense.rejected": ["Rejected an expense", "correction"],
  "fitness.weight_logged": ["Logged weight for {client}", "routine"],
  "fitness.measurements_logged": ["Logged measurements for {client}", "routine"],
  "fitness.checkin_reviewed": ["Reviewed {client}'s weekly check-in", "routine"],
  "fitness.note_added": ["Added a trainer note for {client}", "routine"],
  "fitness.plan_edited": ["Edited {client}'s fitness plan", "routine"],
  "document.uploaded": ["Uploaded a document for {client}", "routine"],
  "settings.changed": ["Changed settings", "correction"],
  "salesreport.submitted": ["Submitted a daily sales report", "routine"],
  "salesreport.edited": ["Edited a daily sales report", "correction"],
  "salesreport.day_off": ["Marked a day off in the daily sales report", "routine"],
  "session.completed": ["Completed a session with {client}", "routine"],
  "session.rescheduled": ["Rescheduled a session with {client}", "correction"],
  "session.cancelled": ["Cancelled a session with {client}", "sensitive"],
  "session.missed": ["Marked a session with {client} as missed", "correction"],
  "session.schedule_generated": ["Generated {client}'s session schedule", "routine"],
  "session.future_cancelled": ["Cancelled {client}'s future sessions", "sensitive"],
  "payment.recorded": ["Recorded a payment from {client}", "routine"],
  "payment.approved": ["Approved a payment from {client}", "routine"],
  "payment.rejected": ["Rejected a payment from {client}", "correction"],
  "payment.edited": ["Edited a payment for {client}", "correction"],
  "payment.voided": ["Voided a payment for {client}", "sensitive"],
  "payment.reopened": ["Moved a payment for {client} back to review", "correction"],
  "payment.waived": ["Waived an amount for {client}", "correction"],
  "payment.balance_waived": ["Waived {client}'s outstanding balance", "sensitive"],
  "payment.proof_submitted": ["Submitted payment proof", "routine"],
  "payment.schedule_changed": ["Changed {client}'s payment schedule", "correction"],
  "client.viewed": ["Viewed {client}'s profile", "neutral"],
  "document.downloaded": ["Opened a document of {client}", "neutral"],
  "report.exported": ["Exported a CSV report", "sensitive"],
  "auth.signed_in": ["Signed in", "neutral"],
  "auth.signed_out": ["Signed out", "neutral"],
};

/** "PaymentMilestone" -> "payment milestone"; "completedDate" -> "completed date". */
export function humanizeIdentifier(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** A diff entry is [before, after]; named events store plain values. */
function afterValue(v: unknown): unknown {
  return Array.isArray(v) && v.length === 2 ? v[1] : v;
}

function rupees(v: unknown): string | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function shortValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(
        new Date(v),
      );
    }
    return humanizeIdentifier(v.length > 40 ? `${v.slice(0, 40)}…` : v);
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

/** "Mozilla/5.0 (Windows NT 10.0; ...) Chrome/129" -> "Chrome on Windows". */
export function deviceFromUserAgent(ua: string | null | undefined): string | undefined {
  if (!ua) return undefined;
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : undefined;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : undefined;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

export function describeActivity(e: ActivityDescribeInput): ActivityDescription {
  const changes = asRecord(e.changes);
  const meta = asRecord(e.meta);
  const verb = e.verb ?? "";
  const entry = CATALOG[verb];
  const details: string[] = [];

  const amount = rupees(afterValue(changes.amount));
  if (amount && (verb.startsWith("payment.") || e.entityType.startsWith("Payment") || e.entityType === "Expense")) {
    details.push(amount);
  }
  if (typeof changes.reason === "string" && changes.reason) details.push(`Reason: "${changes.reason}"`);
  if (typeof changes.rejectionReason === "string") details.push(`Reason: "${changes.rejectionReason}"`);

  // The client row is gone, so the name lives only in the event's snapshot.
  if (verb === "client.deleted" && typeof changes.name === "string") {
    details.unshift(typeof changes.clientCode === "string" ? `${changes.name} (${changes.clientCode})` : changes.name);
  }

  if (verb === "report.exported") {
    if (typeof meta.report === "string") details.push(meta.report);
    if (typeof meta.rows === "number") details.push(`${meta.rows} rows`);
  } else if (verb === "document.downloaded" && typeof meta.fileName === "string") {
    details.push(meta.fileName);
  } else if (verb === "auth.signed_in") {
    const device = deviceFromUserAgent(typeof meta.userAgent === "string" ? meta.userAgent : null);
    if (device) details.push(device);
  } else if (verb === "session.rescheduled" && changes.from && changes.to) {
    details.push(`${shortValue(changes.from)} to ${shortValue(changes.to)}`);
  } else if (Array.isArray(changes.status) && changes.status.length === 2 && changes.status[0] != null) {
    details.push(`Status: ${shortValue(changes.status[0])} to ${shortValue(changes.status[1])}`);
  } else if (!entry && e.kind === "change") {
    // Generic capture: name the fields that changed.
    const fields = Object.keys(changes).filter((f) => !f.endsWith("Id") && f !== "id");
    if (fields.length > 0 && verb.endsWith(".updated")) {
      details.push(`Changed ${fields.slice(0, 4).map(humanizeIdentifier).join(", ")}${fields.length > 4 ? "…" : ""}`);
    }
  }

  if (entry) return { template: entry[0], tone: entry[1], detail: details.join(" · ") || undefined };

  // Generic fallback: "<noun>.<created|updated|deleted>".
  const [noun = "record", action = "updated"] = verb.split(".");
  const label = noun === "followUp" ? "follow-up" : humanizeIdentifier(noun || e.entityType);
  const article = /^[aeiou]/.test(label) ? "an" : "a";
  const past = action === "created" ? "Created" : action === "deleted" ? "Deleted" : "Updated";
  return {
    template: `${past} ${article} ${label}`,
    tone: action === "deleted" ? "sensitive" : "routine",
    detail: details.join(" · ") || e.summary || undefined,
  };
}

/** Plain-text sentence (CSV, report). `clientName` null = no client. */
export function activitySentence(d: ActivityDescription, clientName: string | null): string {
  if (d.template.includes("{client}")) return d.template.replace("{client}", clientName ?? "a client");
  return clientName ? `${d.template} for ${clientName}` : d.template;
}

/** "Arjun Nair" -> "A. N." (report option to hide client names). */
export function clientInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => `${w.charAt(0).toUpperCase()}.`)
    .join(" ");
}

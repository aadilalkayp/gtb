import { supabase } from "./supabase";
import { env } from "./env";

/**
 * fetch wrapper that attaches the current Supabase access token. Used both by
 * the ZenStack hooks (data API) and for direct calls like /api/me.
 */
export const authedFetch: typeof fetch = async (input, init) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

/** Base endpoint the ZenStack-generated hooks talk to. */
export const ZENSTACK_ENDPOINT = `${env.apiUrl}/api/model`;

export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    phone: string | null;
    avatarUrl: string | null;
    client: {
      id: string;
      clientCode: string;
      type: "groom" | "bride";
      status: string;
      leadPhase: string;
    } | null;
  } | null;
}

export async function fetchMe(): Promise<MeResponse["user"]> {
  const res = await authedFetch(`${env.apiUrl}/api/me`);
  if (!res.ok) return null;
  const json = (await res.json()) as MeResponse;
  return json.user;
}

/** POST JSON to an API route, throwing the server's error message on failure. */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await authedFetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as T & { error?: string };
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export interface InviteResult {
  ok: boolean;
  emailed: boolean;
  /** Present only as a dev fallback when mail is not configured (SEC-9). */
  registrationUrl?: string;
  warning?: string;
  mailError?: string;
}

/** Provision + invite a lead. Returns the registration link and whether it was emailed. */
export function inviteClient(clientId: string): Promise<InviteResult> {
  return postJson<InviteResult>("/api/clients/invite", { clientId });
}

/** Enroll a client in a plan (creates the ClientPlan + milestone schedule).
 *  Staff may pass a custom schedule; it must sum to the plan price. */
export function enrollClient(
  clientId: string,
  planId: string,
  milestones?: { amount: number; dueDate: string }[],
): Promise<{ clientPlan: { id: string } }> {
  return postJson("/api/clients/enroll", { clientId, planId, milestones });
}

export interface UploadedDocument {
  id: string;
  type: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
}

/** Approve a client-submitted payment. Returns whether it converted the client. */
export function approvePayment(
  paymentId: string,
  paymentMethod: string,
  notes?: string,
): Promise<{ ok: boolean; converted: boolean }> {
  return postJson("/api/payments/approve", { paymentId, paymentMethod, notes });
}

/** Staff records money received outside the portal (or, founder/ops, a waiver). */
export function recordPayment(args: {
  clientId: string;
  amount: number;
  paymentMethod?: string;
  kind?: "payment" | "waiver";
  notes?: string;
}): Promise<{ ok: boolean; converted: boolean; paymentId: string }> {
  return postJson("/api/payments/record", args);
}

/** Reject a submitted payment with a reason. */
export function rejectPayment(paymentId: string, reason: string): Promise<{ ok: boolean }> {
  return postJson("/api/payments/reject", { paymentId, reason });
}

/** Client submits a payment of any amount — advances leadPhase atomically (STATE-6). */
export function submitPayment(
  amount: number,
  proofDocumentId: string,
): Promise<{ ok: boolean; paymentId: string }> {
  return postJson("/api/payments/submit", { amount, proofDocumentId });
}

/** Replace a client's expected payment schedule (founder/ops). Must sum to the
 *  enrolled price; audit-logged server-side. */
export function updateMilestones(
  clientId: string,
  milestones: { amount: number; dueDate: string }[],
): Promise<{ ok: boolean; count: number }> {
  return postJson("/api/payments/milestones", { clientId, milestones });
}

/** Create + invite a staff member (founder only). Also resends for pending staff. */
export function inviteStaff(args: {
  name: string;
  email: string;
  phone?: string;
  role: string;
}): Promise<InviteResult & { userId: string }> {
  return postJson("/api/staff/invite", args);
}

/** Assign / reassign a client's team. `staffId: null` clears the role. */
export function assignTeam(
  clientId: string,
  assignments: { role: string; staffId: string | null }[],
): Promise<{ ok: boolean }> {
  return postJson("/api/clients/assign", { clientId, assignments });
}

/** Activate a converted client — generates the session schedule and flips to Active. */
export function activateClient(
  clientId: string,
): Promise<{ ok: boolean; sessionsCreated: number }> {
  return postJson("/api/clients/activate", { clientId });
}

/** Cancel a client (SYS-3): cancels future sessions, waives the outstanding
 *  balance, blocks portal login — one server transaction. */
export function cancelClient(
  clientId: string,
  reason: string,
  waiveOutstanding = true,
): Promise<{ ok: boolean; sessionsCancelled: number; amountWaived: number }> {
  return postJson("/api/clients/cancel", { clientId, reason, waiveOutstanding });
}

/** Complete a client (SYS-3): enforces all-closed sessions + settled payments. */
export function completeClient(clientId: string): Promise<{ ok: boolean }> {
  return postJson("/api/clients/complete", { clientId });
}

/** Mark a session completed (auto-creates the consultant payout, notifies client). */
export function completeSession(
  sessionId: string,
  args?: { notes?: string; actualDate?: string },
): Promise<{ ok: boolean; expenseCreated: boolean }> {
  return postJson("/api/sessions/complete", { sessionId, ...args });
}

/** Reschedule a session to a new date (status → delayed, client notified). */
export function rescheduleSession(sessionId: string, newDate: string): Promise<{ ok: boolean }> {
  return postJson("/api/sessions/reschedule", { sessionId, newDate });
}

/** Cancel a session or mark it missed (audit-logged; replaces the old gateway
 *  status write, which Session policies no longer allow for consultants). */
export function cancelSession(
  sessionId: string,
  outcome: "cancelled" | "missed",
): Promise<{ ok: boolean }> {
  return postJson("/api/sessions/cancel", { sessionId, outcome });
}

/** Change a client's wedding date (founder/ops): regenerates future sessions
 *  from the enrollment snapshot and audit-logs the change (SRS §24.1). */
export function updateWeddingDate(
  clientId: string,
  weddingDate: string,
): Promise<{ ok: boolean; sessionsRescheduled: number }> {
  return postJson("/api/clients/wedding-date", { clientId, weddingDate });
}

/** Client rates a completed session (server-validated, SRS §13.1). */
export function rateSession(
  sessionId: string,
  rating: number,
  ratingFeedback?: string,
): Promise<{ ok: boolean; rating: number }> {
  return postJson("/api/sessions/rate", { sessionId, rating, ratingFeedback });
}

/** Nudge a client about today's workout (staff; one per client per day). */
export function sendFitnessReminder(
  planId: string,
): Promise<{ ok: boolean; sent: boolean; reason?: string }> {
  return postJson("/api/fitness/remind", { planId });
}

/** Mint a short-lived signed URL to view a stored document. */
export async function getDocumentUrl(documentId: string): Promise<string> {
  const { url } = await postJson<{ url: string }>("/api/documents/signed-url", { documentId });
  return url;
}

// ---------------------------------------------------------------------------
// Transformation Readiness Scan
// ---------------------------------------------------------------------------

export type ScanPhotoAngle = "front" | "left" | "right" | "full_body";

export interface SelfReportAnswers {
  fitnessLevel?: "beginner" | "intermediate" | "advanced";
  workoutsPerWeek?: number;
  sleepHours?: number;
  waterLitres?: number;
  photoComfort?: number;
  styleConfidence?: number;
  routineConsistency?: number;
  socialEase?: number;
}

export interface ScanReport {
  scanId: string;
  status: string;
  createdAt: string;
  type: "groom" | "bride";
  daysToWedding: number;
  weddingDate: string;
  categoryLabels: Record<"skin" | "hair" | "beard" | "style", string>;
  photos: ScanPhotoAngle[];
  scores: {
    skin: number;
    hair: number;
    beard: number;
    style: number | null;
    appearance: number;
    /** Headline composite Groom Score. */
    readiness: number;
  } | null;
  groomScore: {
    overall: number;
    appearance: number;
    fitness: number | null;
    confidence: number | null;
    prepProgress: number | null;
    inputs: { fitness: boolean; confidence: boolean; prep: boolean };
  } | null;
  attributes: { key: string; label: string; score: number }[];
  selfReport: SelfReportAnswers | null;
  focusAreas: { area: string; weight: number }[];
  highlights: string[];
  suggestions: string[];
  claimed: boolean;
  roadmap: {
    id: string;
    kind: string;
    category: string;
    title: string;
    description: string | null;
    dueDate: string;
    weekNumber: number | null;
    isDone: boolean;
  }[];
}

export interface ScanTeaser {
  readinessScore: number;
  daysToWedding: number;
}

/** Start a scan. Anonymous callers get a scanId + teaser; a logged-in client's
 *  rescan attaches to their record and returns the full report directly. */
export async function startScan(args: {
  file: File;
  /** Optional extra angles — a full-body photo unlocks the Style score. */
  fullBody?: File | null;
  left?: File | null;
  right?: File | null;
  weddingDate?: string;
  type?: "groom" | "bride";
}): Promise<{ scanId?: string; teaser?: ScanTeaser; report?: ScanReport }> {
  const form = new FormData();
  form.append("file", args.file);
  if (args.fullBody) form.append("fullBody", args.fullBody);
  if (args.left) form.append("left", args.left);
  if (args.right) form.append("right", args.right);
  if (args.weddingDate) form.append("weddingDate", args.weddingDate);
  if (args.type) form.append("type", args.type);
  const res = await authedFetch(`${env.apiUrl}/api/scan/start`, { method: "POST", body: form });
  const json = (await res.json().catch(() => null)) as {
    scanId?: string;
    teaser?: ScanTeaser;
    report?: ScanReport;
    error?: string;
  } | null;
  if (!res.ok) throw new Error(json?.error || `Scan failed (${res.status})`);
  return json ?? {};
}

/** Claim an anonymous scan with contact details — unlocks the full report. */
export function claimScan(args: {
  scanId: string;
  name: string;
  email: string;
  phone: string;
  city?: string;
}): Promise<{ ok: boolean; emailed: boolean; report: ScanReport }> {
  return postJson("/api/scan/claim", args);
}

/** Fetch a scan report by scanId (anonymous funnel read path). */
export async function fetchScanReport(scanId: string): Promise<ScanReport> {
  const res = await authedFetch(
    `${env.apiUrl}/api/scan/report?scanId=${encodeURIComponent(scanId)}`,
  );
  const json = (await res.json().catch(() => null)) as {
    report?: ScanReport;
    error?: string;
  } | null;
  if (!res.ok || !json?.report) throw new Error(json?.error || `Request failed (${res.status})`);
  return json.report;
}

/** Save the self-assessment (fitness habits + confidence) on a scan. */
export function submitSelfReport(
  scanId: string,
  answers: SelfReportAnswers,
): Promise<{ ok: boolean; report: ScanReport }> {
  return postJson("/api/scan/self-report", { scanId, answers });
}

// ---- Outfit analysis --------------------------------------------------------

export interface OutfitResult {
  index: number;
  verdict: "great" | "good" | "avoid";
  score: number;
  colorNote: string;
  fitNote: string;
  suggestion: string;
}

export interface OutfitCheck {
  id: string;
  createdAt: string;
  /** Signed URLs of the garment photos, in upload order. */
  photos: string[];
  results: OutfitResult[];
  palette: { tryColors: string[]; avoidColors: string[]; summary: string } | null;
  modelVersion: string | null;
}

export async function submitOutfitCheck(args: {
  scanId: string;
  garments: File[];
}): Promise<{ ok: boolean; check: OutfitCheck }> {
  const form = new FormData();
  form.append("scanId", args.scanId);
  args.garments.slice(0, 3).forEach((f, i) => form.append(`garment${i + 1}`, f));
  const res = await authedFetch(`${env.apiUrl}/api/scan/outfit`, { method: "POST", body: form });
  const json = (await res.json().catch(() => null)) as {
    ok: boolean;
    check: OutfitCheck;
    error?: string;
  } | null;
  if (!res.ok || !json?.check) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

export async function fetchOutfitChecks(scanId: string): Promise<OutfitCheck[]> {
  const res = await authedFetch(
    `${env.apiUrl}/api/scan/outfit?scanId=${encodeURIComponent(scanId)}`,
  );
  const json = (await res.json().catch(() => null)) as {
    checks?: OutfitCheck[];
    error?: string;
  } | null;
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json?.checks ?? [];
}

// ---- Look previews ----------------------------------------------------------

export interface LookPreview {
  id: string;
  kind: "hairstyle" | "beard";
  styleKey: string;
  status: "pending" | "ready" | "failed";
  url: string | null;
  error: string | null;
  createdAt: string;
}

export function requestLook(
  scanId: string,
  styleKey: string,
): Promise<{ ok: boolean; look: LookPreview; cached?: boolean }> {
  return postJson("/api/scan/look", { scanId, styleKey });
}

export async function fetchLooks(
  scanId: string,
): Promise<{ looks: LookPreview[]; remainingToday: number }> {
  const res = await authedFetch(`${env.apiUrl}/api/scan/look?scanId=${encodeURIComponent(scanId)}`);
  const json = (await res.json().catch(() => null)) as {
    looks?: LookPreview[];
    remainingToday?: number;
    error?: string;
  } | null;
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return { looks: json?.looks ?? [], remainingToday: json?.remainingToday ?? 0 };
}

// ---- Coach ------------------------------------------------------------------

export interface CoachChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: string[];
  createdAt: string;
}

export function askCoach(args: {
  scanId: string;
  conversationId?: string | null;
  message: string;
}): Promise<{
  ok: boolean;
  conversationId: string;
  message: CoachChatMessage;
  knowledgeArticles: number;
}> {
  return postJson("/api/coach/ask", args);
}

export async function fetchCoachHistory(
  scanId: string,
): Promise<{
  conversationId: string | null;
  messages: CoachChatMessage[];
  knowledgeArticles: number;
}> {
  const res = await authedFetch(`${env.apiUrl}/api/coach/ask?scanId=${encodeURIComponent(scanId)}`);
  const json = (await res.json().catch(() => null)) as {
    conversationId: string | null;
    messages: CoachChatMessage[];
    knowledgeArticles: number;
    error?: string;
  } | null;
  if (!res.ok || !json) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

/** Mint a signed URL for a scan photo (staff 360° / portal history). */
export async function getScanPhotoUrl(scanId: string): Promise<string> {
  const { url } = await postJson<{ url: string }>("/api/scan/photo-url", { scanId });
  return url;
}

/** Upload a client document (payment proof, photo) via the server storage route. */
export async function uploadClientDocument(args: {
  clientId: string;
  type: string;
  file: File;
  sessionId?: string;
}): Promise<UploadedDocument> {
  const form = new FormData();
  form.append("file", args.file);
  form.append("clientId", args.clientId);
  form.append("type", args.type);
  if (args.sessionId) form.append("sessionId", args.sessionId);
  const res = await authedFetch(`${env.apiUrl}/api/documents/upload`, {
    method: "POST",
    body: form,
  });
  const json = (await res.json().catch(() => null)) as {
    document?: UploadedDocument;
    error?: string;
  } | null;
  if (!res.ok || !json?.document) {
    throw new Error(json?.error || `Upload failed (${res.status})`);
  }
  return json.document;
}

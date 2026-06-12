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
  registrationUrl: string;
  warning?: string;
  mailError?: string;
}

/** Provision + invite a lead. Returns the registration link and whether it was emailed. */
export function inviteClient(clientId: string): Promise<InviteResult> {
  return postJson<InviteResult>("/api/clients/invite", { clientId });
}

/** Enroll a client in a plan (creates the ClientPlan + installment schedule). */
export function enrollClient(
  clientId: string,
  planId: string,
): Promise<{ clientPlan: { id: string } }> {
  return postJson("/api/clients/enroll", { clientId, planId });
}

export interface UploadedDocument {
  id: string;
  type: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
}

/** Approve (or manually record) a payment. Returns whether it converted the client. */
export function approvePayment(
  installmentId: string,
  paymentMethod: string,
  notes?: string,
): Promise<{ ok: boolean; converted: boolean }> {
  return postJson("/api/payments/approve", { installmentId, paymentMethod, notes });
}

/** Reject a submitted payment proof with a reason. */
export function rejectPayment(installmentId: string, reason: string): Promise<{ ok: boolean }> {
  return postJson("/api/payments/reject", { installmentId, reason });
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

/** Assign / reassign a client's team. */
export function assignTeam(
  clientId: string,
  assignments: { role: string; staffId: string }[],
): Promise<{ ok: boolean }> {
  return postJson("/api/clients/assign", { clientId, assignments });
}

/** Activate a converted client — generates the session schedule and flips to Active. */
export function activateClient(
  clientId: string,
): Promise<{ ok: boolean; sessionsCreated: number }> {
  return postJson("/api/clients/activate", { clientId });
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

/** Mint a short-lived signed URL to view a stored document. */
export async function getDocumentUrl(documentId: string): Promise<string> {
  const { url } = await postJson<{ url: string }>("/api/documents/signed-url", { documentId });
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

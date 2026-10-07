/**
 * Calls to the Pre-Consultation Assessment routes (apps/api/src/app/api/assessment/*).
 * The form never writes through the ZenStack gateway: answers are validated
 * and saved by the submit route, photos by the photos route.
 */
import { useQuery } from "@tanstack/react-query";
import type { PreConsultationRow, SkinPhotoAngle } from "@gtb/shared";
import { authedFetch } from "./api";
import { env } from "./env";

export class AssessmentRequestError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<never> {
  const json = (await res.json().catch(() => null)) as {
    error?: string;
    fieldErrors?: Record<string, string>;
  } | null;
  throw new AssessmentRequestError(
    json?.error || `Request failed (${res.status})`,
    json?.fieldErrors ?? {},
  );
}

export interface SkinPhoto {
  angle: SkinPhotoAngle;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  documentId: string;
  previewUrl: string | null;
  originalUrl: string | null;
}

export type AssessmentRecord = PreConsultationRow & {
  id: string;
  clientId: string;
  completedAt: string | null;
  reopenedAt: string | null;
  // Older (pre-Oct 2026) answers, shown read-only for existing clients.
  age?: number | null;
  gender?: string | null;
  fitnessLevel?: string | null;
  fitnessGoals?: string[];
  bodyType?: string | null;
  stylePreferences?: string[];
  outfitBudgetRange?: string | null;
  colorPreferences?: string | null;
  stylingNotes?: string | null;
};

export interface AssessmentState {
  assessment: AssessmentRecord | null;
  photos: SkinPhoto[];
  /** Whether the client may still change answers and photos. */
  editable: boolean;
}

const url = (path: string) => `${env.apiUrl}${path}`;

export async function fetchAssessment(clientId?: string): Promise<AssessmentState> {
  const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  const res = await authedFetch(url(`/api/assessment${q}`));
  if (!res.ok) return readError(res);
  return (await res.json()) as AssessmentState;
}

export function useAssessment(clientId?: string, enabled = true) {
  return useQuery({
    queryKey: ["assessment", clientId ?? "me"],
    queryFn: () => fetchAssessment(clientId),
    enabled,
    // Signed photo URLs last an hour; refresh well before that.
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * A downscaled JPEG copy (longest side 1600px) for quick previews and the
 * PDF. The original is uploaded untouched alongside it. Returns null when
 * the browser can't decode the image; the server then falls back to the
 * original.
 */
async function makePreview(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.86),
    );
  } catch {
    return null;
  }
}

export async function uploadSkinPhoto(angle: SkinPhotoAngle, file: File): Promise<SkinPhoto> {
  const form = new FormData();
  form.append("angle", angle);
  form.append("file", file);
  const preview = await makePreview(file);
  if (preview) form.append("preview", preview, `${angle}-preview.jpg`);
  const res = await authedFetch(url("/api/assessment/photos"), { method: "POST", body: form });
  if (!res.ok) return readError(res);
  const json = (await res.json()) as { photo: SkinPhoto | null };
  if (!json.photo) throw new AssessmentRequestError("The photo was saved but could not be shown");
  return json.photo;
}

export async function removeSkinPhoto(angle: SkinPhotoAngle): Promise<void> {
  const res = await authedFetch(url(`/api/assessment/photos?angle=${angle}`), { method: "DELETE" });
  if (!res.ok) return readError(res);
}

export async function submitAssessment(answers: unknown): Promise<void> {
  const res = await authedFetch(url("/api/assessment/submit"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answers),
  });
  if (!res.ok) return readError(res);
}

export async function reopenAssessment(clientId: string): Promise<void> {
  const res = await authedFetch(url("/api/assessment/reopen"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) return readError(res);
}

/** Fetch the internal PDF and hand it to the browser as a download. */
export async function downloadAssessmentPdf(clientId: string): Promise<void> {
  const res = await authedFetch(url(`/api/assessment/pdf?clientId=${encodeURIComponent(clientId)}`));
  if (!res.ok) return readError(res);
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "GTB_Pre_Consultation.pdf";
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Open the PDF in a new tab (view rather than save). */
export async function viewAssessmentPdf(clientId: string): Promise<void> {
  // Open the tab synchronously so popup blockers allow it, then fill it.
  const tab = window.open("", "_blank");
  try {
    const res = await authedFetch(
      url(`/api/assessment/pdf?clientId=${encodeURIComponent(clientId)}`),
    );
    if (!res.ok) return await readError(res);
    const href = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = href;
    else window.location.href = href;
  } catch (e) {
    tab?.close();
    throw e;
  }
}

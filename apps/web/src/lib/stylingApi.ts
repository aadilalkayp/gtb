/**
 * Calls to the Styling Blueprint routes (apps/api/src/app/api/styling/*).
 * Draft content is edited through the ZenStack hooks; everything here is a
 * workflow action, a file, or the client's published view.
 */
import { useQuery } from "@tanstack/react-query";
import type {
  BlueprintDisplayStatus,
  BlueprintSnapshot,
  BlueprintSection,
  StylingPhotoSlot,
} from "@gtb/shared";
import { authedFetch } from "./api";
import { env } from "./env";

async function readError(res: Response): Promise<never> {
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(json?.error || `Request failed (${res.status})`);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await authedFetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return readError(res);
  return (await res.json()) as T;
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await authedFetch(`${env.apiUrl}${path}`, { method: "POST", body: form });
  if (!res.ok) return readError(res);
  return (await res.json()) as T;
}

// ---- Client portal ------------------------------------------------------------

export interface PortalPhoto {
  id: string;
  slot: StylingPhotoSlot;
  url: string | null;
  retakeNote: string | null;
  retakeRequestedAt: string | null;
  createdAt: string;
}

export interface PublishedBlueprint {
  version: number;
  publishedAt: string;
  snapshot: BlueprintSnapshot;
  images: Record<string, string | null>;
  pdfDocumentId: string | null;
  checkedEssentialIds: string[];
}

export type PortalStyling =
  | { enabled: false }
  | {
      enabled: true;
      status: BlueprintDisplayStatus;
      stylist: { name: string; avatarUrl: string | null } | null;
      photosSubmittedAt: string | null;
      dueAt: string | null;
      photos: PortalPhoto[];
      blueprint: PublishedBlueprint | null;
    };

export const PORTAL_STYLING_KEY = ["portal-styling"] as const;

export function usePortalStyling(enabled = true) {
  return useQuery({
    queryKey: PORTAL_STYLING_KEY,
    enabled,
    queryFn: async () => {
      const res = await authedFetch(`${env.apiUrl}/api/styling/portal`);
      if (!res.ok) return readError(res);
      return (await res.json()) as PortalStyling;
    },
  });
}

export function uploadStylingPhoto(args: {
  slot: StylingPhotoSlot;
  file: File;
  clientId?: string;
}) {
  const form = new FormData();
  form.append("slot", args.slot);
  form.append("file", args.file);
  if (args.clientId) form.append("clientId", args.clientId);
  return postForm<{
    photo: { id: string; slot: StylingPhotoSlot; url: string | null };
    status: string;
  }>("/api/styling/photos", form);
}

export function removeStylingPhoto(photoId: string) {
  return post<{ ok: boolean }>("/api/styling/photos/remove", { photoId });
}

export function submitStylingPhotos() {
  return post<{ ok: boolean; dueAt: string }>("/api/styling/submit", {});
}

export function toggleEssential(essentialId: string, checked: boolean) {
  return post<{ ok: boolean; checkedEssentialIds: string[] }>("/api/styling/essentials", {
    essentialId,
    checked,
  });
}

// ---- Staff --------------------------------------------------------------------

export interface StaffPhoto {
  id: string;
  slot: StylingPhotoSlot;
  documentId: string;
  retakeNote: string | null;
  retakeRequestedAt: string | null;
  createdAt: string;
  url: string | null;
  downloadUrl: string | null;
}

export interface StaffImage {
  id: string;
  fileName: string;
  createdAt: string;
  url: string | null;
}

export function stylingMediaKey(clientId: string) {
  return ["styling-media", clientId] as const;
}

export function useStylingMedia(clientId: string | undefined) {
  return useQuery({
    queryKey: stylingMediaKey(clientId ?? ""),
    enabled: Boolean(clientId),
    // Signed URLs last an hour; refresh well before.
    staleTime: 20 * 60 * 1000,
    queryFn: () =>
      post<{ photos: StaffPhoto[]; images: StaffImage[] }>("/api/styling/media", { clientId }),
  });
}

export function uploadStylingImage(clientId: string, file: File) {
  const form = new FormData();
  form.append("clientId", clientId);
  form.append("file", file);
  return postForm<{ document: { id: string; fileName: string }; url: string | null }>(
    "/api/styling/images",
    form,
  );
}

export function requestRetake(photoId: string, note: string) {
  return post<{ ok: boolean; status: string }>("/api/styling/retake", { photoId, note });
}

export function cancelRetake(photoId: string) {
  return post<{ ok: boolean; status: string }>("/api/styling/retake", { photoId, cancel: true });
}

export function sendPhotoReminder(clientId: string) {
  return post<{ ok: boolean; sent: boolean; reason?: string }>("/api/styling/remind", { clientId });
}

export function publishBlueprint(clientId: string) {
  return post<{ ok: boolean; version: number; pdf: boolean; emptySections: BlueprintSection[] }>(
    "/api/styling/publish",
    { clientId },
  );
}

export function regenerateBlueprintPdf(clientId: string) {
  return post<{ ok: boolean; pdfDocumentId: string }>("/api/styling/pdf", { clientId });
}

/** Download every photo as one ZIP (the browser saves it). */
export async function downloadPhotosZip(clientId: string, clientCode: string): Promise<void> {
  const res = await authedFetch(`${env.apiUrl}/api/styling/photos/zip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) return readError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${clientCode}-styling-photos.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Server helpers for the Styling Blueprint routes (STYLING_BLUEPRINT.md).
 *
 * Workflow writes (photo uploads, submit, retakes, publish) go through
 * /api/styling/* with the base client; the stylist's draft content is edited
 * through the policy-checked gateway. The client never reads draft tables:
 * everything they see comes from the last published snapshot.
 */
import { Prisma, prisma, type AuthUser } from "@gtb/db";
import { isBlueprintArchived, type BlueprintDraft, type BlueprintSnapshot } from "@gtb/shared";
import { createSignedUrls } from "./storage.js";

export type StylingRole = "admin" | "stylist" | "staff" | "owner";

export interface StylingAccess {
  clientId: string;
  clientName: string;
  clientCode: string;
  clientStatus: string;
  clientUserId: string | null;
  clientEmail: string;
  /** founder / ops_head */
  isAdmin: boolean;
  /** the client's active styling consultant */
  isStylist: boolean;
  /** any active assignment (read-only for non-stylists) */
  isAssigned: boolean;
  /** the client themself */
  isOwner: boolean;
  archived: boolean;
}

/** Who the caller is relative to a client's Blueprint. Null when the client doesn't exist. */
export async function stylingAccess(
  user: AuthUser,
  clientId: string,
): Promise<StylingAccess | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      clientCode: true,
      status: true,
      userId: true,
      email: true,
      assignments: {
        where: { staffId: user.id, isActive: true },
        select: { role: true },
      },
    },
  });
  if (!client) return null;
  const isAdmin = user.role === "founder" || user.role === "ops_head";
  return {
    clientId: client.id,
    clientName: client.name,
    clientCode: client.clientCode,
    clientStatus: client.status,
    clientUserId: client.userId,
    clientEmail: client.email,
    isAdmin,
    isStylist: client.assignments.some((a) => a.role === "styling_consultant"),
    isAssigned: client.assignments.length > 0,
    isOwner: client.userId !== null && client.userId === user.id,
    archived: isBlueprintArchived(client.status),
  };
}

/** May edit the Blueprint and run workflow actions on it. */
export function canWorkBlueprint(a: StylingAccess): boolean {
  return a.isAdmin || a.isStylist;
}

/** May read the staff view (draft, photos). */
export function canViewBlueprint(a: StylingAccess): boolean {
  return a.isAdmin || a.isAssigned;
}

/** The client's own record, for portal routes. */
export async function ownClientId(user: AuthUser): Promise<string | null> {
  if (user.role !== "client") return null;
  const c = await prisma.client.findFirst({ where: { userId: user.id }, select: { id: true } });
  return c?.id ?? null;
}

function servicesIncludeStyling(snapshot: Prisma.JsonValue | null | undefined): boolean {
  return (
    Array.isArray(snapshot) &&
    snapshot.some(
      (s) =>
        s &&
        typeof s === "object" &&
        !Array.isArray(s) &&
        (s as Record<string, unknown>).serviceType === "styling",
    )
  );
}

/**
 * Whether styling is part of this client's journey: their plan includes the
 * styling service, a stylist is assigned, or a Blueprint already exists.
 * Groom To Be clients only for now (GTB decision, Oct 2026).
 */
export async function clientHasStyling(clientId: string): Promise<boolean> {
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      type: true,
      clientPlan: { select: { servicesSnapshot: true } },
      stylingBlueprint: { select: { id: true } },
      assignments: { where: { isActive: true, role: "styling_consultant" }, select: { id: true } },
    },
  });
  if (!c || c.type !== "groom") return false;
  return (
    Boolean(c.stylingBlueprint) ||
    c.assignments.length > 0 ||
    servicesIncludeStyling(c.clientPlan?.servicesSnapshot)
  );
}

/**
 * The client's Blueprint, created on first need and pre-filled from their
 * onboarding assessment (body type, style preferences, height).
 */
export async function ensureBlueprint(clientId: string) {
  const existing = await prisma.stylingBlueprint.findUnique({ where: { clientId } });
  if (existing) return existing;
  const assessment = await prisma.assessment.findUnique({
    where: { clientId },
    select: { bodyType: true, stylePreferences: true, heightCm: true },
  });
  try {
    return await prisma.stylingBlueprint.create({
      data: {
        clientId,
        bodyType: assessment?.bodyType ?? undefined,
        stylePreferences: assessment?.stylePreferences.length
          ? assessment.stylePreferences.join(", ")
          : undefined,
        heightCm: assessment?.heightCm ?? undefined,
      },
    });
  } catch (e) {
    // Two first visits at once: the unique clientId lets exactly one win.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return prisma.stylingBlueprint.findUniqueOrThrow({ where: { clientId } });
    }
    throw e;
  }
}

/** User ids of the client's active styling consultant(s). */
export async function stylistUserIds(clientId: string): Promise<string[]> {
  const rows = await prisma.assignment.findMany({
    where: { clientId, isActive: true, role: "styling_consultant" },
    select: { staffId: true },
  });
  return rows.map((r) => r.staffId);
}

export async function activeStylist(
  clientId: string,
): Promise<{ id: string; name: string; avatarUrl: string | null } | null> {
  const a = await prisma.assignment.findFirst({
    where: { clientId, isActive: true, role: "styling_consultant" },
    select: { staff: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return a?.staff ?? null;
}

/** Everything buildBlueprintSnapshot needs, read with the base client. */
export async function loadBlueprintDraft(blueprintId: string): Promise<BlueprintDraft> {
  const bp = await prisma.stylingBlueprint.findUniqueOrThrow({
    where: { id: blueprintId },
    include: { looks: true, palettes: true, items: true, essentials: true },
  });
  return bp;
}

/** The client's styling images (stylist edits), keyed by id. Used to validate snapshot references. */
export async function stylingImageIds(clientId: string): Promise<Set<string>> {
  const docs = await prisma.document.findMany({
    where: { clientId, type: "styling_image" },
    select: { id: true },
  });
  return new Set(docs.map((d) => d.id));
}

/**
 * Signed URLs for the given document ids, restricted to this client's styling
 * photos and images, so a forged id in a snapshot can't expose another file.
 */
export async function signStylingDocs(
  clientId: string,
  ids: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return {};
  const docs = await prisma.document.findMany({
    where: { id: { in: unique }, clientId, type: { in: ["styling_image", "styling_photo"] } },
    select: { id: true, fileUrl: true },
  });
  const urls = await createSignedUrls(docs.map((d) => d.fileUrl));
  const out: Record<string, string> = {};
  for (const d of docs) {
    const url = urls.get(d.fileUrl);
    if (url) out[d.id] = url;
  }
  return out;
}

export function parseSnapshot(json: Prisma.JsonValue): BlueprintSnapshot {
  return json as unknown as BlueprintSnapshot;
}

/** Latest published version of a Blueprint, if any. */
export async function latestVersion(blueprintId: string) {
  return prisma.stylingBlueprintVersion.findFirst({
    where: { blueprintId },
    orderBy: { version: "desc" },
  });
}

/** Staff deep link to the client's Styling tab. */
export function staffBlueprintLink(clientId: string): string {
  return `/clients/${clientId}?tab=styling`;
}

export const PORTAL_STYLING_LINK = "/portal/styling";

import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { blueprintDisplayStatus, snapshotImageIds, type BlueprintStatus } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json } from "@/lib/http";
import {
  activeStylist,
  clientHasStyling,
  ensureBlueprint,
  latestVersion,
  ownClientId,
  parseSnapshot,
  signStylingDocs,
} from "@/lib/styling";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/**
 * The client's Styling tab, in one read: workflow status, their photos (with
 * any retake notes), and the last PUBLISHED Blueprint with its images signed.
 * Draft content never leaves the server here; the portal has no gateway
 * access to the Blueprint tables at all.
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const clientId = await ownClientId(user);
  if (!clientId) return json(req, { error: "Forbidden" }, 403);

  if (!(await clientHasStyling(clientId))) return json(req, { enabled: false });

  const [bp, client, stylist] = await Promise.all([
    ensureBlueprint(clientId),
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { status: true } }),
    activeStylist(clientId),
  ]);
  const [photos, version] = await Promise.all([
    prisma.stylingPhoto.findMany({
      where: { blueprintId: bp.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        slot: true,
        documentId: true,
        retakeNote: true,
        retakeRequestedAt: true,
        createdAt: true,
      },
    }),
    latestVersion(bp.id),
  ]);
  const snapshot = version ? parseSnapshot(version.snapshot) : null;
  const urls = await signStylingDocs(clientId, [
    ...photos.map((p) => p.documentId),
    ...(snapshot ? snapshotImageIds(snapshot) : []),
  ]);

  return json(req, {
    enabled: true,
    status: blueprintDisplayStatus(bp.status as BlueprintStatus, client.status),
    stylist: stylist ? { name: stylist.name, avatarUrl: stylist.avatarUrl } : null,
    photosSubmittedAt: bp.photosSubmittedAt,
    dueAt: bp.dueAt,
    photos: photos.map((p) => ({
      id: p.id,
      slot: p.slot,
      url: urls[p.documentId] ?? null,
      retakeNote: p.retakeNote,
      retakeRequestedAt: p.retakeRequestedAt,
      createdAt: p.createdAt,
    })),
    blueprint:
      version && snapshot
        ? {
            version: version.version,
            publishedAt: version.createdAt,
            snapshot,
            images: Object.fromEntries(
              snapshotImageIds(snapshot).map((id) => [id, urls[id] ?? null]),
            ),
            pdfDocumentId: version.pdfDocumentId,
            checkedEssentialIds: bp.checkedEssentialIds,
          }
        : null,
  });
}

export const GET = withRequestLog(handleGet);

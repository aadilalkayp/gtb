import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { BLUEPRINT_SECTIONS, buildBlueprintSnapshot, emptySections } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { blueprintReadyEmail } from "@/lib/emails";
import { env } from "@/lib/env";
import { withRequestLog } from "@/lib/handler";
import { json, readJson } from "@/lib/http";
import { requestLog } from "@/lib/logger";
import { sendMail } from "@/lib/mailer";
import { notifyUsers } from "@/lib/notify";
import {
  PORTAL_STYLING_LINK,
  activeStylist,
  canWorkBlueprint,
  ensureBlueprint,
  loadBlueprintDraft,
  stylingAccess,
  stylingImageIds,
} from "@/lib/styling";
import { generateBlueprintPdf } from "@/lib/stylingPdf";

export const runtime = "nodejs";
export const OPTIONS = (req: NextRequest) => handleOptions(req);

const CHECKLIST = [
  "consultationDone",
  "outfitFinalized",
  "accessoriesFinalized",
  "guideDelivered",
  "finalConfirmation",
] as const;

/**
 * Publish the stylist's draft. The draft is frozen into an immutable
 * StylingBlueprintVersion (images validated as this client's styling images),
 * which is all the client and the PDF ever read. Later edits stay as a draft
 * until the next publish. Side effects: open retake requests are withdrawn,
 * "Styling guide delivered" is ticked on the styling checklist, the PDF is
 * generated, and the client is notified in the portal and by email. A PDF or
 * email failure is logged and never undoes the publish.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  if (user.role === "client") return json(req, { error: "Forbidden" }, 403);
  const body = await readJson<{ clientId: string }>(req);
  if (!body?.clientId) return json(req, { error: "clientId is required" }, 400);

  const access = await stylingAccess(user, body.clientId);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (!canWorkBlueprint(access))
    return json(req, { error: "Only the client's stylist can publish" }, 403);
  if (access.archived) return json(req, { error: "This programme has ended" }, 409);

  const bp = await ensureBlueprint(access.clientId);
  if (!bp.photosSubmittedAt)
    return json(req, { error: "The client hasn't sent their photos yet" }, 409);

  const snapshot = buildBlueprintSnapshot(
    await loadBlueprintDraft(bp.id),
    await stylingImageIds(access.clientId),
  );
  const empty = emptySections(snapshot);
  if (empty.length === BLUEPRINT_SECTIONS.length)
    return json(req, { error: "Add some recommendations before publishing" }, 400);

  const now = new Date();
  const nextVersion = bp.publishedVersion + 1;
  let version;
  try {
    version = await prisma.$transaction(async (tx) => {
      // Guard on the version we read: a concurrent publish fails cleanly.
      const claimed = await tx.stylingBlueprint.updateMany({
        where: { id: bp.id, publishedVersion: bp.publishedVersion },
        data: { status: "published", publishedAt: now, publishedVersion: nextVersion },
      });
      if (claimed.count === 0) throw new Error("concurrent_publish");
      await tx.stylingPhoto.updateMany({
        where: { blueprintId: bp.id, retakeNote: { not: null } },
        data: { retakeNote: null, retakeRequestedAt: null },
      });
      const created = await tx.stylingBlueprintVersion.create({
        data: {
          blueprintId: bp.id,
          version: nextVersion,
          snapshot: snapshot as object,
          publishedById: user.id,
        },
      });

      // The old checklist's "Styling guide delivered" is now this Blueprint.
      const ops = await tx.stylingOperation.findMany({
        where: { clientId: access.clientId, status: { not: "completed" }, guideDelivered: false },
      });
      for (const op of ops) {
        const ticked = CHECKLIST.filter((k) => (k === "guideDelivered" ? true : op[k])).length;
        await tx.stylingOperation.update({
          where: { id: op.id },
          data: {
            guideDelivered: true,
            guideDeliveredAt: now,
            status: ticked === CHECKLIST.length ? "completed" : "in_progress",
          },
        });
      }
      return created;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "concurrent_publish") {
      return json(
        req,
        { error: "Someone else just published this Blueprint. Reload and try again." },
        409,
      );
    }
    throw e;
  }

  const pdfDocumentId = await generateBlueprintPdf(version.id, user.id);

  if (access.clientUserId) {
    const isUpdate = nextVersion > 1;
    await notifyUsers([access.clientUserId], {
      type: "styling_blueprint_published",
      title: isUpdate ? "Your Styling Blueprint was updated" : "Your Styling Blueprint is ready",
      body: isUpdate
        ? "Take a look at what's changed."
        : "Your looks, hair brief, colours and shopping list are ready.",
      linkPath: PORTAL_STYLING_LINK,
    });
    const stylist = await activeStylist(access.clientId);
    const mail = await sendMail(
      blueprintReadyEmail({
        to: access.clientEmail,
        clientName: access.clientName.split(" ")[0] ?? access.clientName,
        stylistName: stylist?.name ?? null,
        portalUrl: `${env.webPublicUrl}${PORTAL_STYLING_LINK}`,
        isUpdate,
      }),
    );
    if (!mail.sent)
      requestLog(req).warn("blueprint email not sent", {
        clientId: access.clientId,
        error: mail.error,
      });
  }

  return json(req, {
    ok: true,
    version: nextVersion,
    pdf: Boolean(pdfDocumentId),
    emptySections: empty,
  });
}

export const POST = withRequestLog(handlePost);

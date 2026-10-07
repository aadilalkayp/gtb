import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { istStartOfDay } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json, readJson } from "@/lib/http";
import { notifyUsers } from "@/lib/notify";
import {
  PORTAL_STYLING_LINK,
  canWorkBlueprint,
  ensureBlueprint,
  stylingAccess,
} from "@/lib/styling";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** "Send reminder" from the Awaiting photos queue. One per client per IST day. */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  if (user.role === "client") return json(req, { error: "Forbidden" }, 403);
  const body = await readJson<{ clientId: string }>(req);
  if (!body?.clientId) return json(req, { error: "clientId is required" }, 400);

  const access = await stylingAccess(user, body.clientId);
  if (!access) return json(req, { error: "Client not found" }, 404);
  if (!canWorkBlueprint(access)) return json(req, { error: "Forbidden" }, 403);
  if (!access.clientUserId) return json(req, { error: "Client has no portal account yet" }, 409);

  const bp = await ensureBlueprint(access.clientId);
  if (bp.status !== "awaiting_photos")
    return json(req, { error: "The client has already sent their photos" }, 409);

  const today = istStartOfDay(new Date());
  if (bp.lastReminderAt && bp.lastReminderAt >= today) {
    return json(req, { ok: true, sent: false, reason: "already_sent_today" });
  }
  const claimed = await prisma.stylingBlueprint.updateMany({
    where: { id: bp.id, OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: today } }] },
    data: { lastReminderAt: new Date() },
  });
  if (claimed.count === 0)
    return json(req, { ok: true, sent: false, reason: "already_sent_today" });

  await notifyUsers([access.clientUserId], {
    type: "styling_photos_reminder",
    title: "Your stylist is waiting for your photos",
    body: "Send five quick photos so your Styling Blueprint can be prepared.",
    linkPath: PORTAL_STYLING_LINK,
  });
  return json(req, { ok: true, sent: true });
}

export const POST = withRequestLog(handlePost);

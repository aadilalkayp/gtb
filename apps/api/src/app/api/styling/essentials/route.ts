import type { NextRequest } from "next/server";
import { prisma } from "@gtb/db";
import { resolveAuthUser } from "@/lib/auth";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json, readJson } from "@/lib/http";
import { latestVersion, ownClientId, parseSnapshot, stylingAccess } from "@/lib/styling";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** The client ticks a Big Day Essentials item on their published Blueprint. */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const clientId = await ownClientId(user);
  if (!clientId) return json(req, { error: "Forbidden" }, 403);
  const body = await readJson<{ essentialId: string; checked: boolean }>(req);
  if (!body?.essentialId || typeof body.checked !== "boolean") {
    return json(req, { error: "essentialId and checked are required" }, 400);
  }

  const access = await stylingAccess(user, clientId);
  if (!access || access.archived) return json(req, { error: "This programme has ended" }, 409);

  const bp = await prisma.stylingBlueprint.findUnique({ where: { clientId } });
  const version = bp ? await latestVersion(bp.id) : null;
  if (!bp || !version) return json(req, { error: "Your Blueprint isn't published yet" }, 404);
  if (!parseSnapshot(version.snapshot).essentials.some((e) => e.id === body.essentialId)) {
    return json(req, { error: "Item not found" }, 404);
  }

  // Array set-ops in SQL so two quick taps can't lose one another's tick.
  if (body.checked) {
    await prisma.$executeRaw`UPDATE "StylingBlueprint" SET "checkedEssentialIds" = array_append(array_remove("checkedEssentialIds", ${body.essentialId}), ${body.essentialId}) WHERE "id" = ${bp.id}`;
  } else {
    await prisma.$executeRaw`UPDATE "StylingBlueprint" SET "checkedEssentialIds" = array_remove("checkedEssentialIds", ${body.essentialId}) WHERE "id" = ${bp.id}`;
  }
  const after = await prisma.stylingBlueprint.findUniqueOrThrow({
    where: { id: bp.id },
    select: { checkedEssentialIds: true },
  });
  return json(req, { ok: true, checkedEssentialIds: after.checkedEssentialIds });
}

export const POST = withRequestLog(handlePost);

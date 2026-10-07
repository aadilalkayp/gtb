import type { NextRequest } from "next/server";
import { isConversationKind } from "@gtb/shared";
import { resolveAuthUser } from "@/lib/auth";
import { chatAccess, ensureConversation, markRead } from "@/lib/chat";
import { handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { json, readJson } from "@/lib/http";
import { ownClientId } from "@/lib/styling";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

/** Mark a conversation read for the caller (the open chat calls this as new messages arrive). */
async function handlePost(req: NextRequest): Promise<Response> {
  const user = await resolveAuthUser(req);
  if (!user) return json(req, { error: "Unauthorized" }, 401);
  const body = await readJson<{ kind: string; clientId: string }>(req);
  if (!isConversationKind(body?.kind))
    return json(req, { error: "Unknown conversation kind" }, 400);
  const clientId = user.role === "client" ? await ownClientId(user) : (body?.clientId ?? null);
  if (!clientId) return json(req, { error: "clientId is required" }, 400);

  const access = await chatAccess(user, clientId, body.kind);
  if (!access?.canRead) return json(req, { error: "Forbidden" }, 403);
  if (!access.isClient && !access.isStaff) return json(req, { ok: true });
  const conversation = await ensureConversation(clientId, body.kind);
  await markRead(conversation.id, user.id);
  return json(req, { ok: true });
}

export const POST = withRequestLog(handlePost);

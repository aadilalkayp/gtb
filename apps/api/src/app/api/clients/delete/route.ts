import type { NextRequest } from "next/server";
import {
  deleteLead,
  previewLeadDeletion,
  LeadDeletionError,
  DELETE_BLOCKER_LABELS,
} from "@gtb/db/server";
import { resolveAuthUser } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { withRequestLog } from "@/lib/handler";
import { requestLog } from "@/lib/logger";
import { deleteScanObjects } from "@/lib/storage";

export const OPTIONS = (req: NextRequest) => handleOptions(req);

function json(req: NextRequest, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

function errorResponse(req: NextRequest, e: unknown): Response {
  if (!(e instanceof LeadDeletionError)) throw e;
  if (e.code === "NOT_FOUND") return json(req, { error: "Client not found" }, 404);
  if (e.code === "CHANGED") {
    return json(req, { error: "This lead changed while deleting. Reload and try again." }, 409);
  }
  return json(
    req,
    {
      error: DELETE_BLOCKER_LABELS[e.blockers[0]!] ?? "This lead can't be deleted",
      blockers: e.blockers,
    },
    409,
  );
}

async function founderOnly(req: NextRequest) {
  const authUser = await resolveAuthUser(req);
  if (!authUser) return { error: json(req, { error: "Unauthorized" }, 401) };
  if (authUser.role !== "founder") return { error: json(req, { error: "Forbidden" }, 403) };
  return { authUser };
}

/**
 * Preview a lead deletion (founder only): whether the client qualifies, the
 * reasons it doesn't, and what the delete would remove.
 */
async function handleGet(req: NextRequest): Promise<Response> {
  const { error } = await founderOnly(req);
  if (error) return error;
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return json(req, { error: "clientId is required" }, 400);
  try {
    const preview = await previewLeadDeletion(clientId);
    return json(req, {
      ...preview,
      blockerLabels: preview.blockers.map((b) => DELETE_BLOCKER_LABELS[b]),
    });
  } catch (e) {
    return errorResponse(req, e);
  }
}

/**
 * Permanently delete a fresh lead (founder only). Only leads with no plan, no
 * delivered work and no portal sign-in qualify (see clientDeletion.ts); the
 * rest are closed with Cancel. One transaction, audited with a snapshot of
 * the lead; scan photos are removed from storage after it commits.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  const { authUser, error } = await founderOnly(req);
  if (error) return error;

  let body: { clientId?: string; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  const { clientId, reason } = body;
  if (!clientId) return json(req, { error: "clientId is required" }, 400);
  if (!reason?.trim()) return json(req, { error: "A reason is required" }, 400);

  try {
    const result = await deleteLead({ clientId, reason, actorId: authUser.id });
    // After commit: a failure here only orphans objects in a private bucket.
    await deleteScanObjects(result.scanObjectPaths).catch((e) =>
      requestLog(req).error("lead delete: scan photo cleanup failed", { clientId, error: e }),
    );
    return json(req, { ok: true, counts: result.counts });
  } catch (e) {
    return errorResponse(req, e);
  }
}

export const GET = withRequestLog(handleGet);
export const POST = withRequestLog(handlePost);

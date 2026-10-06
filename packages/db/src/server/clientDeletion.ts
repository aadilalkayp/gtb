import { Prisma } from "@prisma/client";
import { prisma } from "../index.js";
import { logActivity } from "./activityLog.js";

/**
 * Permanent deletion of a fresh lead (founder only, clients/delete).
 *
 * Deliberately narrow: only a lead that never got anywhere qualifies (no plan,
 * so no payments; no delivered work; never signed in). Anything further along
 * is closed with Cancel instead. That scope keeps the delete simple: the only
 * rows a fresh lead can own are its assignment, follow-ups, assessment, the
 * readiness-scan funnel trail, and an unused portal User.
 *
 * Every row is deleted explicitly (never by a database cascade) so the audit
 * capture sees it; the funnel models it excludes as noise are summarised as
 * counts on the `client.deleted` event instead.
 */

export type DeleteBlocker =
  | "not_a_lead"
  | "has_plan"
  | "has_sessions"
  | "has_documents"
  | "has_fitness"
  | "has_styling"
  | "has_expenses"
  | "signed_in";

export const DELETE_BLOCKER_LABELS: Record<DeleteBlocker, string> = {
  not_a_lead: "Only leads can be deleted. Use Cancel for clients further along.",
  has_plan: "A plan has been selected for this lead.",
  has_sessions: "This lead has sessions.",
  has_documents: "This lead has documents.",
  has_fitness: "This lead has fitness records.",
  has_styling: "This lead has styling work.",
  has_expenses: "Expenses are linked to this lead.",
  signed_in: "This lead has signed in to the portal.",
};

/** What a delete removes, for the confirmation dialog and the audit event. */
export interface LeadDeletionCounts {
  assignments: number;
  followUps: number;
  /** Tasks are staff work: kept, with the client link removed. */
  tasksUnlinked: number;
  assessment: number;
  scans: number;
  roadmapItems: number;
  coachThreads: number;
  outfitChecks: number;
  lookPreviews: number;
  messages: number;
  portalAccount: number;
}

export interface LeadDeletionPreview {
  client: { id: string; name: string; clientCode: string };
  deletable: boolean;
  blockers: DeleteBlocker[];
  counts: LeadDeletionCounts;
}

export interface LeadDeletionResult {
  counts: LeadDeletionCounts;
  /** scan-photos bucket objects to remove once the transaction has committed. */
  scanObjectPaths: string[];
}

export class LeadDeletionError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "NOT_DELETABLE" | "CHANGED",
    public readonly blockers: DeleteBlocker[] = [],
  ) {
    super(code);
  }
}

type Db = typeof prisma | Prisma.TransactionClient;

async function inspect(db: Db, clientId: string) {
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: {
      leadSource: { select: { name: true } },
      createdBy: { select: { name: true } },
      user: { select: { id: true, authId: true, _count: { select: { authSessions: true } } } },
      clientPlan: { select: { id: true } },
      assessment: { select: { id: true } },
      _count: {
        select: {
          sessions: true,
          documents: true,
          fitnessPlans: true,
          weightLogs: true,
          bodyMeasurements: true,
          trainerNotes: true,
          stylingOps: true,
          expenses: true,
          assignments: true,
          followUps: true,
          tasks: true,
          scans: true,
          roadmapItems: true,
          coachThreads: true,
          outfitChecks: true,
          lookPreviews: true,
          outboundMessages: true,
        },
      },
    },
  });
  if (!client) return null;

  const c = client._count;
  const blockers: DeleteBlocker[] = [];
  if (client.status !== "lead") blockers.push("not_a_lead");
  if (client.clientPlan) blockers.push("has_plan");
  if (c.sessions > 0) blockers.push("has_sessions");
  if (c.documents > 0) blockers.push("has_documents");
  if (c.fitnessPlans + c.weightLogs + c.bodyMeasurements + c.trainerNotes > 0) blockers.push("has_fitness");
  if (c.stylingOps > 0) blockers.push("has_styling");
  if (c.expenses > 0) blockers.push("has_expenses");
  if (client.user && (client.user.authId || client.user._count.authSessions > 0)) blockers.push("signed_in");

  const counts: LeadDeletionCounts = {
    assignments: c.assignments,
    followUps: c.followUps,
    tasksUnlinked: c.tasks,
    assessment: client.assessment ? 1 : 0,
    scans: c.scans,
    roadmapItems: c.roadmapItems,
    coachThreads: c.coachThreads,
    outfitChecks: c.outfitChecks,
    lookPreviews: c.lookPreviews,
    messages: c.outboundMessages,
    portalAccount: client.user ? 1 : 0,
  };
  return { client, blockers, counts };
}

/** Whether a client can be deleted, and what the delete would remove. */
export async function previewLeadDeletion(clientId: string): Promise<LeadDeletionPreview> {
  const found = await inspect(prisma, clientId);
  if (!found) throw new LeadDeletionError("NOT_FOUND");
  const { client, blockers, counts } = found;
  return {
    client: { id: client.id, name: client.name, clientCode: client.clientCode },
    deletable: blockers.length === 0,
    blockers,
    counts,
  };
}

/**
 * Delete a fresh lead and everything it owns, in one transaction. Eligibility
 * is re-checked inside the transaction; anything attached concurrently (a plan,
 * a session) trips a foreign key on the final client delete and rolls it all
 * back as CHANGED. Storage objects are returned for the caller to remove after
 * commit (a rolled-back delete must not lose photos).
 */
export async function deleteLead(input: {
  clientId: string;
  reason: string;
  actorId: string;
}): Promise<LeadDeletionResult> {
  const reason = input.reason.trim();
  try {
    return await prisma.$transaction(async (tx) => {
      const found = await inspect(tx, input.clientId);
      if (!found) throw new LeadDeletionError("NOT_FOUND");
      const { client, blockers, counts } = found;
      if (blockers.length > 0) throw new LeadDeletionError("NOT_DELETABLE", blockers);
      const clientId = client.id;

      // Readiness-scan trail. Outfit checks, look previews and coach threads
      // may hang off the lead's scans without carrying the clientId.
      const scans = await tx.scan.findMany({
        where: { clientId },
        select: { id: true, photoPath: true, photos: { select: { path: true } } },
      });
      const scanIds = scans.map((s) => s.id);
      const ownedOrScan = { OR: [{ clientId }, { scanId: { in: scanIds } }] };
      const outfitChecks = await tx.outfitCheck.findMany({ where: ownedOrScan, select: { photoPaths: true } });
      const looks = await tx.lookPreview.findMany({ where: ownedOrScan, select: { path: true } });
      const scanObjectPaths = [
        ...scans.flatMap((s) => [s.photoPath, ...s.photos.map((p) => p.path)]),
        ...outfitChecks.flatMap((o) => o.photoPaths),
        ...looks.map((l) => l.path).filter((p): p is string => Boolean(p)),
      ];

      await tx.coachMessage.deleteMany({ where: { conversation: ownedOrScan } });
      await tx.coachConversation.deleteMany({ where: ownedOrScan });
      await tx.outfitCheck.deleteMany({ where: ownedOrScan });
      await tx.lookPreview.deleteMany({ where: ownedOrScan });
      await tx.scanPhoto.deleteMany({ where: { scanId: { in: scanIds } } });
      await tx.scan.deleteMany({ where: { clientId } });
      await tx.roadmapItem.deleteMany({ where: { clientId } });
      await tx.outboundMessage.deleteMany({ where: { clientId } });

      // CRM rows.
      await tx.followUp.deleteMany({ where: { clientId } });
      await tx.assignment.deleteMany({ where: { clientId } });
      await tx.assessment.deleteMany({ where: { clientId } });
      await tx.task.updateMany({ where: { clientId }, data: { clientId: null } });
      // Staff notifications pointing at the profile would open a missing page.
      await tx.notification.deleteMany({ where: { linkPath: { startsWith: `/clients/${clientId}` } } });

      // The named event carries a snapshot: once the row is gone, this is the
      // only place the founder can see who the lead was.
      await logActivity(tx, {
        verb: "client.deleted",
        entityType: "client",
        entityId: clientId,
        action: "deleted",
        performedById: input.actorId,
        summary: `Deleted lead ${client.name} (${client.clientCode})`,
        changes: {
          reason,
          name: client.name,
          clientCode: client.clientCode,
          email: client.email,
          phone: client.phone,
          city: client.city,
          type: client.type,
          weddingDate: client.weddingDate.toISOString(),
          leadPhase: client.leadPhase,
          leadSource: client.leadSource?.name ?? null,
          createdBy: client.createdBy?.name ?? null,
          createdAt: client.createdAt.toISOString(),
          removed: counts,
        },
      });

      await tx.client.delete({ where: { id: clientId } });
      // An invited-but-never-signed-in portal account goes with the lead, so
      // a stale invite link resolves to nobody.
      if (client.user) await tx.user.delete({ where: { id: client.user.id } });

      return { counts, scanObjectPaths };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2003") throw new LeadDeletionError("CHANGED");
      if (e.code === "P2025") throw new LeadDeletionError("NOT_FOUND");
    }
    throw e;
  }
}

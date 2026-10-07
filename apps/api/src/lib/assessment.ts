import { prisma, type AuthUser } from "@gtb/db";
import { CLIENT_TYPE_LABELS, SKIN_PHOTO_ANGLES, type SkinPhotoAngle } from "@gtb/shared";
import { env } from "./env.js";
import { layout, button, esc } from "./emails.js";
import { logger } from "./logger.js";
import { mailConfigured, sendMail } from "./mailer.js";
import { notifyUsers } from "./notify.js";
import { createSignedUrls } from "./storage.js";

const log = logger.child({ mod: "assessment" });

/**
 * Pre-Consultation Assessment access (GTB, Oct 2026). Facial photos and health
 * answers are visible to admins and to the client's assigned CRO, skincare
 * consultant and fitness trainer, mirroring the Assessment / SkinPhoto read
 * policies in schema.zmodel.
 */
export const ASSESSMENT_VIEWER_ROLES = ["cro", "skincare_consultant", "fitness_trainer"] as const;

export interface AssessmentAccess {
  clientId: string;
  clientName: string;
  isOwner: boolean;
  isAdmin: boolean;
  /** May see the answers, photos and PDF. */
  canView: boolean;
}

export async function assessmentAccess(
  user: AuthUser,
  clientId: string,
): Promise<AssessmentAccess | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      userId: true,
      assignments: { where: { staffId: user.id, isActive: true }, select: { role: true } },
    },
  });
  if (!client) return null;
  const isOwner = client.userId === user.id;
  const isAdmin = user.role === "founder" || user.role === "ops_head";
  const isViewer = client.assignments.some((a) =>
    (ASSESSMENT_VIEWER_ROLES as readonly string[]).includes(a.role),
  );
  return {
    clientId: client.id,
    clientName: client.name,
    isOwner,
    isAdmin,
    canView: isOwner || isAdmin || isViewer,
  };
}

/** The client's own client id, or null for anyone else. */
export async function ownClientId(user: AuthUser): Promise<string | null> {
  if (user.role !== "client") return null;
  const c = await prisma.client.findUnique({ where: { userId: user.id }, select: { id: true } });
  return c?.id ?? null;
}

/**
 * Whether the client may still change their answers and photos. Before the
 * first submission (or after an admin reopens the form) always; after it,
 * only while onboarding is still open (a lead with no payment submitted),
 * matching the wizard, where earlier steps lock once a payment is in.
 */
export async function clientCanEdit(clientId: string): Promise<boolean> {
  const [assessment, client, livePayments] = await Promise.all([
    prisma.assessment.findUnique({ where: { clientId }, select: { submittedAt: true } }),
    prisma.client.findUnique({ where: { id: clientId }, select: { status: true } }),
    prisma.payment.count({
      where: { clientPlan: { clientId }, status: { in: ["pending_review", "approved"] } },
    }),
  ]);
  if (!assessment?.submittedAt) return true;
  return client?.status === "lead" && livePayments === 0;
}

export interface SkinPhotoView {
  angle: SkinPhotoAngle;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  documentId: string;
  /** Downscaled preview (falls back to the original). */
  previewUrl: string | null;
  /** The untouched original upload. */
  originalUrl: string | null;
}

function mimeFor(fileName: string): string {
  return /\.png$/i.test(fileName) ? "image/png" : "image/jpeg";
}

/** The client's skin photos in angle order, with short-lived signed URLs. */
export async function skinPhotoViews(clientId: string): Promise<SkinPhotoView[]> {
  const rows = await prisma.skinPhoto.findMany({
    where: { assessment: { clientId } },
    select: {
      angle: true,
      previewPath: true,
      createdAt: true,
      document: { select: { id: true, fileName: true, fileSize: true, fileUrl: true } },
    },
  });
  const paths = rows.flatMap((r) => [r.document.fileUrl, ...(r.previewPath ? [r.previewPath] : [])]);
  let signed = new Map<string, string>();
  try {
    signed = await createSignedUrls(paths);
  } catch (error) {
    log.warn("skin photo urls not signed", { clientId, error });
  }
  const byAngle = new Map(rows.map((r) => [r.angle, r]));
  return SKIN_PHOTO_ANGLES.flatMap((angle) => {
    const r = byAngle.get(angle);
    if (!r) return [];
    const original = signed.get(r.document.fileUrl) ?? null;
    return [
      {
        angle,
        fileName: r.document.fileName,
        fileSize: r.document.fileSize,
        mimeType: mimeFor(r.document.fileName),
        uploadedAt: r.createdAt,
        documentId: r.document.id,
        previewUrl: (r.previewPath && signed.get(r.previewPath)) || original,
        originalUrl: original,
      },
    ];
  });
}

/** Staff link to the client's assessment tab. */
export function staffAssessmentLink(clientId: string): string {
  return `/clients/${clientId}?tab=assessment`;
}

/**
 * Who hears about a new or updated assessment: the operations team, who look
 * after skincare plan PDFs (GTB, Oct 2026), plus the client's assigned
 * skincare consultant and fitness trainer. Founders stand in when there is no
 * active ops head.
 */
async function assessmentRecipients(clientId: string): Promise<{ id: string; email: string; name: string }[]> {
  const [ops, assigned] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ops_head", isActive: true },
      select: { id: true, email: true, name: true },
    }),
    prisma.assignment.findMany({
      where: { clientId, isActive: true, role: { in: ["skincare_consultant", "fitness_trainer"] } },
      select: { staff: { select: { id: true, email: true, name: true, isActive: true } } },
    }),
  ]);
  const team = ops.length
    ? ops
    : await prisma.user.findMany({
        where: { role: "founder", isActive: true },
        select: { id: true, email: true, name: true },
      });
  const people = [...team, ...assigned.filter((a) => a.staff.isActive).map((a) => a.staff)];
  return [...new Map(people.map((p) => [p.id, p])).values()];
}

function assessmentEmail(args: {
  to: string;
  staffName: string;
  clientName: string;
  brand: string;
  link: string;
  isUpdate: boolean;
}) {
  const subject = args.isUpdate
    ? `${args.clientName} updated their pre-consultation assessment`
    : `${args.clientName} submitted their pre-consultation assessment`;
  const lead = args.isUpdate
    ? `${args.clientName} (${args.brand}) has updated their pre-consultation assessment.`
    : `${args.clientName} (${args.brand}) has submitted their pre-consultation assessment, including their three skin photos.`;
  const html = layout(
    subject,
    `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6">Hi ${esc(args.staffName)},</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6">${esc(lead)} You can review the answers and download the PDF before the consultation.</p>
    <p style="margin:0 0 22px">${button(args.link, "Open the assessment")}</p>
  `,
  );
  const text = `Hi ${args.staffName},

${lead} You can review the answers and download the PDF before the consultation:

${args.link}

- GTB OS`;
  return { to: args.to, subject, html, text };
}

/** In-app + email notice that a client submitted (or resubmitted) the form. */
export async function notifyAssessmentSubmitted(clientId: string, isUpdate: boolean): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, type: true },
  });
  if (!client) return;
  const people = await assessmentRecipients(clientId);
  const linkPath = staffAssessmentLink(clientId);
  await notifyUsers(
    people.map((p) => p.id),
    {
      type: isUpdate ? "assessment_updated" : "assessment_submitted",
      title: isUpdate
        ? `${client.name} updated their pre-consultation assessment`
        : `${client.name} submitted their pre-consultation assessment`,
      body: "Review the answers and skin photos, or download the PDF, before the consultation.",
      linkPath,
    },
  );
  if (!mailConfigured) return;
  const brand = CLIENT_TYPE_LABELS[client.type];
  await Promise.all(
    people.map((p) =>
      sendMail(
        assessmentEmail({
          to: p.email,
          staffName: p.name.split(" ")[0] ?? p.name,
          clientName: client.name,
          brand,
          link: `${env.webPublicUrl}${linkPath}`,
          isUpdate,
        }),
      ).catch((error) => log.warn("assessment email failed", { clientId, error })),
    ),
  );
}

/**
 * A skincare consultant or fitness trainer assigned after the client
 * submitted: tell them the assessment is ready to review.
 */
export async function notifyNewAssigneesOfAssessment(
  clientId: string,
  assignees: { staffId: string; role: string }[],
): Promise<void> {
  const relevant = assignees.filter(
    (a) => a.role === "skincare_consultant" || a.role === "fitness_trainer",
  );
  if (!relevant.length) return;
  const assessment = await prisma.assessment.findUnique({
    where: { clientId },
    select: { submittedAt: true, client: { select: { name: true } } },
  });
  if (!assessment?.submittedAt) return;
  await notifyUsers(
    relevant.map((a) => a.staffId),
    {
      type: "assessment_ready",
      title: `${assessment.client.name}'s pre-consultation assessment is ready`,
      body: "Review the answers and skin photos, or download the PDF, before the consultation.",
      linkPath: staffAssessmentLink(clientId),
    },
  );
}

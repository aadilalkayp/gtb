/**
 * Daily Styling Blueprint jobs, run from /api/cron/daily. In the API app (not
 * @gtb/db) because the retention purge touches Supabase Storage.
 *
 * 1. Photo retention (GTB decision, Oct 2026): a client's original styling
 *    photos and the stylist's edited images are deleted 6 months after the
 *    big day. Blueprint text and the published PDF stay.
 * 2. Late Blueprints: once a Blueprint passes its due date, Ops Head,
 *    Founder and the stylist are told once.
 */
import { prisma } from "@gtb/db";
import { istStartOfDay } from "@gtb/shared";
import { getAdminUserIds, notifyUsers } from "./notify.js";
import { deleteObjects } from "./storage.js";
import { logger } from "./logger.js";

const log = logger.child({ mod: "stylingJobs" });

export const STYLING_PHOTO_RETENTION_MONTHS = 6;

export interface StylingJobReport {
  stylingFilesPurged: number;
  lateBlueprintAlerts: number;
}

function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export async function runStylingJobs(now = new Date()): Promise<StylingJobReport> {
  const report: StylingJobReport = { stylingFilesPurged: 0, lateBlueprintAlerts: 0 };

  // 1. Retention purge. Storage first, rows after: a failed storage delete is
  //    logged by deleteObjects and the rows go anyway (the objects are then
  //    unreachable, which still honours the promise to clients).
  const cutoff = monthsAgo(now, STYLING_PHOTO_RETENTION_MONTHS);
  const expired = await prisma.document.findMany({
    where: {
      type: { in: ["styling_photo", "styling_image"] },
      client: { weddingDate: { lt: cutoff } },
    },
    select: { id: true, fileUrl: true },
    take: 500,
  });
  if (expired.length) {
    await deleteObjects(expired.map((d) => d.fileUrl));
    const { count } = await prisma.document.deleteMany({
      where: { id: { in: expired.map((d) => d.id) } },
    });
    report.stylingFilesPurged = count;
    log.info("styling files purged", { count });
  }

  // 2. Late Blueprints, alerted once each (deduped on the notification link).
  const todayStart = istStartOfDay(now);
  const late = await prisma.stylingBlueprint.findMany({
    where: {
      status: { in: ["under_review", "retake_requested"] },
      dueAt: { lt: todayStart },
      client: { status: { notIn: ["completed", "cancelled"] } },
    },
    select: {
      id: true,
      dueAt: true,
      clientId: true,
      client: {
        select: {
          name: true,
          assignments: {
            where: { isActive: true, role: "styling_consultant" },
            select: { staffId: true },
          },
        },
      },
    },
  });
  if (late.length) {
    const admins = await getAdminUserIds();
    for (const bp of late) {
      const linkPath = `/clients/${bp.clientId}?tab=styling`;
      const already = await prisma.notification.findFirst({
        where: {
          type: "styling_blueprint_late",
          linkPath,
          createdAt: { gte: bp.dueAt ?? todayStart },
        },
        select: { id: true },
      });
      if (already) continue;
      await notifyUsers([...admins, ...bp.client.assignments.map((a) => a.staffId)], {
        type: "styling_blueprint_late",
        title: "Styling Blueprint is late",
        body: `${bp.client.name}'s Blueprint has passed its due date.`,
        linkPath,
      });
      report.lateBlueprintAlerts += 1;
    }
  }
  return report;
}

/**
 * Daily jobs for the Transformation Readiness Scan, run from /api/cron/daily alongside
 * runDailyJobs. Lives in the API app (not @gtb/db) because the purge touches
 * Supabase Storage. Every notification is deduped per IST day, mirroring the
 * core cron's idempotency rule.
 */
import { prisma } from "@gtb/db";
import { istStartOfDay } from "@gtb/shared";
import { deleteScanObject } from "./storage.js";

export interface ScanJobReport {
  anonymousScansPurged: number;
  roadmapRemindersSent: number;
  rescanRemindersSent: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runScanJobs(): Promise<ScanJobReport> {
  const report: ScanJobReport = {
    anonymousScansPurged: 0,
    roadmapRemindersSent: 0,
    rescanRemindersSent: 0,
  };
  const now = new Date();
  const todayStart = istStartOfDay(now);

  // 1. Purge unclaimed anonymous scans (photo privacy promise: 24h retention
  //    when no email was left). Photo first, row after — a failed storage
  //    delete leaves the row for the next run rather than orphaning the object.
  const stale = await prisma.scan.findMany({
    where: { clientId: null, createdAt: { lt: new Date(now.getTime() - MS_PER_DAY) } },
    select: { id: true, photoPath: true },
  });
  for (const s of stale) {
    await deleteScanObject(s.photoPath);
    await prisma.scan.delete({ where: { id: s.id } });
    report.anonymousScansPurged += 1;
  }

  // 2. Weekly roadmap nudge — Mondays (IST): clients with a linked login and
  //    undone roadmap items due within 7 days get one summary notification.
  const istWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);
  if (istWeekday === "Mon") {
    const clientsWithItems = await prisma.roadmapItem.groupBy({
      by: ["clientId"],
      where: {
        isDone: false,
        dueDate: { gte: todayStart, lt: new Date(todayStart.getTime() + 7 * MS_PER_DAY) },
      },
      _count: { _all: true },
    });
    for (const row of clientsWithItems) {
      const client = await prisma.client.findUnique({
        where: { id: row.clientId },
        select: { userId: true, weddingDate: true, status: true },
      });
      if (!client?.userId || client.status === "cancelled") continue;
      if (client.weddingDate.getTime() < now.getTime()) continue;
      const n = row._count._all;
      const sent = await notifyOncePerDay(client.userId, {
        type: "roadmap_week",
        title: "Your prep plan this week",
        body: `${n} readiness ${n === 1 ? "task" : "tasks"} on your roadmap this week — tick them off as you go.`,
        linkPath: "/portal/scan",
      });
      report.roadmapRemindersSent += sent;
    }
  }

  // 3. Rescan nudge: every 30 days after the latest scored scan (fires only on
  //    the exact multiple, so it self-dedupes across months).
  const latestByClient = await prisma.scan.groupBy({
    by: ["clientId"],
    where: { clientId: { not: null }, status: "scored" },
    _max: { createdAt: true },
  });
  for (const row of latestByClient) {
    const last = row._max.createdAt;
    if (!row.clientId || !last) continue;
    const age = Math.floor((todayStart.getTime() - istStartOfDay(last).getTime()) / MS_PER_DAY);
    if (age <= 0 || age % 30 !== 0) continue;
    const client = await prisma.client.findUnique({
      where: { id: row.clientId },
      select: { userId: true, weddingDate: true, status: true },
    });
    if (!client?.userId || client.status === "cancelled") continue;
    if (client.weddingDate.getTime() < now.getTime()) continue;
    const sent = await notifyOncePerDay(client.userId, {
      type: "rescan_due",
      title: "Time for your monthly rescan",
      body: "It's been a month since your last scan — rescan to see how far you've come.",
      linkPath: "/portal/scan",
    });
    report.rescanRemindersSent += sent;
  }

  return report;
}

async function notifyOncePerDay(
  userId: string,
  input: { type: string; title: string; body: string; linkPath: string },
): Promise<number> {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: input.type,
      linkPath: input.linkPath,
      createdAt: { gte: istStartOfDay(new Date()) },
    },
    select: { id: true },
  });
  if (existing) return 0;
  await prisma.notification.create({ data: { userId, ...input } });
  return 1;
}

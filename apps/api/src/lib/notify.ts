import { prisma } from "@gtb/db";

/**
 * In-app notifications (SRS §18). Notification rows are server-created only
 * (no create policy in the schema), so these helpers use the base Prisma client.
 */

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  linkPath?: string;
}

/** Create the same notification for several users. No-op on an empty list. */
export async function notifyUsers(userIds: string[], n: NotificationInput): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  await prisma.notification.createMany({
    data: unique.map((userId) => ({ userId, ...n })),
  });
}

/** User ids of active Operations Heads + Founders (notified on conversions etc.). */
export async function getAdminUserIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: { in: ["ops_head", "founder"] }, isActive: true },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

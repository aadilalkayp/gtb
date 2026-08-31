/**
 * Shared helpers for the Transformation Readiness Scan routes.
 *
 * The /api/scan/* routes are the product's only unauthenticated surface (the
 * public funnel runs pre-registration), so everything here is written for
 * anonymous callers: rate limiting by IP, scanId-as-bearer-secret access, and
 * report payloads that only ever contain data derived from the scan itself —
 * never fields read off an existing Client row.
 */
import { prisma, type Scan } from "@gtb/db";
import { daysUntil, generateRoadmap } from "@gtb/shared";

// ---------------------------------------------------------------------------
// Rate limiting (fixed window, in-memory). Best-effort per instance — enough
// to stop casual abuse of the free funnel; a shared store can replace it if
// the API ever runs multi-instance.
// ---------------------------------------------------------------------------

const windows = new Map<string, { start: number; count: number }>();
const WINDOW_MS = 60 * 60 * 1000;

export function rateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start > WINDOW_MS) {
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  w.count += 1;
  if (windows.size > 10_000) windows.clear(); // crude memory bound
  return w.count <= max;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "local";
}

// ---------------------------------------------------------------------------
// Report payload
// ---------------------------------------------------------------------------

export type ScanRow = Scan;

export interface ScanReport {
  scanId: string;
  status: string;
  createdAt: string;
  daysToWedding: number;
  weddingDate: string;
  scores: {
    skin: number;
    hair: number;
    beard: number;
    style: number;
    readiness: number;
  } | null;
  focusAreas: { area: string; weight: number }[];
  highlights: string[];
  suggestions: string[];
  claimed: boolean;
  roadmap: {
    id: string;
    kind: string;
    category: string;
    title: string;
    description: string | null;
    dueDate: string;
    weekNumber: number | null;
    isDone: boolean;
  }[];
}

/** Build the anonymous-safe report for a scan. `weddingDate` falls back to the
 *  scan's own captured date; callers pass the Client's date once claimed. */
export async function buildScanReport(scan: ScanRow, weddingDate?: Date): Promise<ScanReport> {
  const wedding = weddingDate ?? scan.weddingDate;
  const roadmap = scan.clientId
    ? await prisma.roadmapItem.findMany({
        where: { clientId: scan.clientId },
        orderBy: { dueDate: "asc" },
      })
    : [];
  const scored =
    scan.status === "scored" &&
    scan.skinScore != null &&
    scan.hairScore != null &&
    scan.beardScore != null &&
    scan.styleScore != null &&
    scan.readinessScore != null;
  return {
    scanId: scan.id,
    status: scan.status,
    createdAt: scan.createdAt.toISOString(),
    daysToWedding: daysUntil(wedding),
    weddingDate: wedding.toISOString(),
    scores: scored
      ? {
          skin: scan.skinScore!,
          hair: scan.hairScore!,
          beard: scan.beardScore!,
          style: scan.styleScore!,
          readiness: scan.readinessScore!,
        }
      : null,
    focusAreas: (scan.focusAreas as { area: string; weight: number }[] | null) ?? [],
    highlights: scan.highlights,
    suggestions: scan.suggestions,
    claimed: Boolean(scan.clientId),
    roadmap: roadmap.map((r) => ({
      id: r.id,
      kind: r.kind,
      category: r.category,
      title: r.title,
      description: r.description,
      dueDate: r.dueDate.toISOString(),
      weekNumber: r.weekNumber,
      isDone: r.isDone,
    })),
  };
}

// ---------------------------------------------------------------------------
// Roadmap sync
// ---------------------------------------------------------------------------

/**
 * (Re)generate a client's roadmap from a scored scan.
 *
 * Checklist milestones are created once per client (they don't depend on
 * scores). Weekly focus items are score-driven: future, undone weeklies are
 * replaced on each new scan so the plan tracks the latest weakest areas —
 * completed weeks and past weeks are history and never touched.
 */
export async function syncRoadmap(
  clientId: string,
  scan: ScanRow,
  weddingDate: Date,
): Promise<number> {
  if (scan.status !== "scored" || scan.skinScore == null) return 0;
  const now = new Date();
  const items = generateRoadmap({
    weddingDate,
    start: now,
    scores: {
      skinScore: scan.skinScore,
      hairScore: scan.hairScore ?? 50,
      beardScore: scan.beardScore ?? 50,
      styleScore: scan.styleScore ?? 50,
    },
  });

  const hasChecklist = await prisma.roadmapItem.findFirst({
    where: { clientId, kind: "checklist" },
    select: { id: true },
  });

  const toCreate = items.filter((i) => i.kind === "weekly_focus" || !hasChecklist);
  await prisma.$transaction([
    prisma.roadmapItem.deleteMany({
      where: { clientId, kind: "weekly_focus", isDone: false, dueDate: { gte: now } },
    }),
    prisma.roadmapItem.createMany({
      data: toCreate.map((i) => ({
        clientId,
        kind: i.kind,
        category: i.category,
        title: i.title,
        description: i.description,
        dueDate: i.dueDate,
        weekNumber: i.weekNumber,
      })),
    }),
  ]);
  return toCreate.length;
}

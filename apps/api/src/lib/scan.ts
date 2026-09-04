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
import {
  computeConfidenceScore,
  computeFitnessScore,
  computeGroomScore,
  computePrepProgress,
  daysUntil,
  generateRoadmap,
  scanCategoryLabels,
  type ScanAttribute,
  type ScanClientType,
  type SelfReport,
} from "@gtb/shared";

// ---------------------------------------------------------------------------
// Rate limiting (fixed window, in-memory). Best-effort per instance — enough
// to stop casual abuse of the free funnel; nginx adds a second layer in front.
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

export type PhotoAngle = "front" | "left" | "right" | "full_body";

export interface ScanReport {
  scanId: string;
  status: string;
  createdAt: string;
  type: ScanClientType;
  daysToWedding: number;
  weddingDate: string;
  /** Category labels for this client type (beard vs brows & lashes). */
  categoryLabels: Record<"skin" | "hair" | "beard" | "style", string>;
  /** Angles captured for this scan; drives "add a full-body photo" prompts. */
  photos: PhotoAngle[];
  scores: {
    skin: number;
    hair: number;
    beard: number;
    /** null until a full-body photo is scanned */
    style: number | null;
    /** Appearance-only readiness (stored per scan; the progress graph). */
    appearance: number;
    /** Headline: the composite Groom Score — appearance + fitness + confidence + prep. */
    readiness: number;
  } | null;
  groomScore: {
    overall: number;
    appearance: number;
    fitness: number | null;
    confidence: number | null;
    prepProgress: number | null;
    inputs: { fitness: boolean; confidence: boolean; prep: boolean };
  } | null;
  attributes: ScanAttribute[];
  selfReport: SelfReport | null;
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
  const [roadmap, photos] = await Promise.all([
    scan.clientId
      ? prisma.roadmapItem.findMany({
          where: { clientId: scan.clientId },
          orderBy: { dueDate: "asc" },
        })
      : Promise.resolve([]),
    prisma.scanPhoto.findMany({ where: { scanId: scan.id }, select: { angle: true } }),
  ]);
  const type = scan.type as ScanClientType;
  const scored =
    scan.status === "scored" &&
    scan.skinScore != null &&
    scan.hairScore != null &&
    scan.beardScore != null &&
    scan.readinessScore != null;

  const selfReport = (scan.selfReport as SelfReport | null) ?? null;
  const prepProgress = computePrepProgress(roadmap);
  const groom = scored
    ? computeGroomScore({
        appearance: scan.readinessScore!,
        fitness: scan.fitnessScore,
        confidence: scan.confidenceScore,
        prepProgress,
      })
    : null;

  return {
    scanId: scan.id,
    status: scan.status,
    createdAt: scan.createdAt.toISOString(),
    type,
    daysToWedding: daysUntil(wedding),
    weddingDate: wedding.toISOString(),
    categoryLabels: scanCategoryLabels(type),
    photos: ["front" as PhotoAngle, ...photos.map((p) => p.angle as PhotoAngle)],
    scores:
      scored && groom
        ? {
            skin: scan.skinScore!,
            hair: scan.hairScore!,
            beard: scan.beardScore!,
            style: scan.styleScore,
            appearance: scan.readinessScore!,
            readiness: groom.overall,
          }
        : null,
    groomScore: groom
      ? {
          overall: groom.overall,
          appearance: scan.readinessScore!,
          fitness: scan.fitnessScore,
          confidence: scan.confidenceScore,
          prepProgress,
          inputs: groom.inputs,
        }
      : null,
    attributes: (scan.attributes as ScanAttribute[] | null) ?? [],
    selfReport,
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
// Self-report → derived scores
// ---------------------------------------------------------------------------

const LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined;

/** Validate + clamp a self-report body from the client. Unknown keys dropped. */
export function sanitizeSelfReport(input: unknown): SelfReport {
  const r = (input ?? {}) as Record<string, unknown>;
  const out: SelfReport = {};
  if (typeof r.fitnessLevel === "string" && LEVELS.has(r.fitnessLevel)) {
    out.fitnessLevel = r.fitnessLevel as SelfReport["fitnessLevel"];
  }
  const w = num(r.workoutsPerWeek, 0, 7);
  if (w != null) out.workoutsPerWeek = Math.round(w);
  const s = num(r.sleepHours, 3, 10);
  if (s != null) out.sleepHours = Math.round(s * 2) / 2;
  const wl = num(r.waterLitres, 0, 5);
  if (wl != null) out.waterLitres = Math.round(wl * 2) / 2;
  for (const k of [
    "photoComfort",
    "styleConfidence",
    "routineConsistency",
    "socialEase",
  ] as const) {
    const v = num(r[k], 1, 5);
    if (v != null) out[k] = Math.round(v);
  }
  return out;
}

/** Persist a self-report on a scan and derive its Fitness/Confidence scores. */
export async function applySelfReport(scanId: string, input: unknown): Promise<ScanRow> {
  const selfReport = sanitizeSelfReport(input);
  return prisma.scan.update({
    where: { id: scanId },
    data: {
      selfReport: selfReport as object,
      fitnessScore: computeFitnessScore(selfReport),
      confidenceScore: computeConfidenceScore(selfReport),
    },
  });
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
    type: scan.type as ScanClientType,
    scores: {
      skinScore: scan.skinScore,
      hairScore: scan.hairScore ?? 50,
      beardScore: scan.beardScore ?? 50,
      styleScore: scan.styleScore,
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

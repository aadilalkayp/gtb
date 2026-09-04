import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { prisma } from "@gtb/db";
import { SCAN_CATEGORY_LABELS, daysUntil, type ScanCategory } from "@gtb/shared";
import { clientIp, rateLimit } from "@/lib/scan";
import { withRequestLog } from "@/lib/handler";

export const runtime = "nodejs";

/**
 * The shareable score card — a 1200×630 PNG rendered server-side (satori →
 * resvg), used as the Open Graph image for share links and as the image people
 * post directly. Public by scanId (a bearer secret), like /api/scan/report, and
 * immutable per scan so it's cached aggressively.
 */

const WIDTH = 1200;
const HEIGHT = 630;

// Traced into the standalone build via outputFileTracingIncludes (next.config).
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
let fonts: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | null = null;
function loadFonts() {
  if (!fonts) {
    fonts = [
      {
        name: "Inter",
        data: readFileSync(path.join(FONT_DIR, "Inter-Regular.woff")),
        weight: 400,
        style: "normal",
      },
      {
        name: "Inter",
        data: readFileSync(path.join(FONT_DIR, "Inter-Bold.woff")),
        weight: 700,
        style: "normal",
      },
    ];
  }
  return fonts;
}

// satori takes React-like element trees; this keeps the route free of JSX.
// An array of children — even an empty or single-element one — counts as
// "multiple children" to satori's flex check, so pass one child bare and omit
// the prop entirely for leaf nodes.
type Node = { type: string; props: Record<string, unknown> };
const h = (
  type: string,
  style: Record<string, unknown>,
  ...children: (Node | string | null)[]
): Node => {
  const kids = children.filter(Boolean);
  return {
    type,
    props: {
      style,
      ...(kids.length === 0 ? {} : kids.length === 1 ? { children: kids[0] } : { children: kids }),
    },
  };
};

const TEAL = "#0b7e70";
const TEAL_DEEP = "#0a5f55";
const PAPER = "#fafcfb";
const INK = "#182420";
const MUTED = "rgba(255,255,255,0.72)";

function bar(label: string, value: number): Node {
  return h(
    "div",
    { display: "flex", flexDirection: "column", width: 190, gap: 8 },
    h(
      "div",
      { display: "flex", justifyContent: "space-between", fontSize: 22, color: MUTED },
      h("span", {}, label),
      h("span", { fontWeight: 700, color: "#fff" }, String(value)),
    ),
    h(
      "div",
      { display: "flex", height: 10, borderRadius: 5, background: "rgba(255,255,255,0.18)" },
      h("div", { width: `${value}%`, height: 10, borderRadius: 5, background: "#fff" }),
    ),
  );
}

function card(args: {
  readiness: number;
  days: number;
  scores: Record<ScanCategory, number>;
  focus: string | null;
}): Node {
  const ring = h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 300,
      height: 300,
      borderRadius: 150,
      border: "18px solid rgba(255,255,255,0.25)",
      background: PAPER,
      flexDirection: "column",
    },
    h(
      "span",
      { fontSize: 120, fontWeight: 700, color: TEAL, lineHeight: 1 },
      String(args.readiness),
    ),
    h("span", { fontSize: 22, color: INK, letterSpacing: 4, marginTop: 6 }, "READY"),
  );

  return h(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      display: "flex",
      background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
      fontFamily: "Inter",
      color: "#fff",
      padding: 64,
    },
    h(
      "div",
      { display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 },
      h(
        "div",
        { display: "flex", flexDirection: "column", gap: 10 },
        h(
          "span",
          { fontSize: 26, letterSpacing: 3, color: MUTED },
          "TRANSFORMATION READINESS SCAN",
        ),
        h(
          "span",
          { fontSize: 56, fontWeight: 700, lineHeight: 1.1 },
          args.days > 0 ? `Wedding in ${args.days} days` : "Wedding day",
        ),
        args.focus ? h("span", { fontSize: 26, color: MUTED }, `Focus: ${args.focus}`) : null,
      ),
      h(
        "div",
        { display: "flex", flexWrap: "wrap", gap: 28, width: 620 },
        ...(Object.keys(SCAN_CATEGORY_LABELS) as ScanCategory[]).map((c) =>
          bar(SCAN_CATEGORY_LABELS[c], args.scores[c]),
        ),
      ),
      h("span", { fontSize: 24, color: MUTED }, "app.glowtobe.com/scan · GTB"),
    ),
    h("div", { display: "flex", alignItems: "center", marginLeft: 40 }, ring),
  );
}

async function handleGet(req: NextRequest): Promise<Response> {
  if (!rateLimit(`card:${clientIp(req)}`, 240)) {
    return new Response("Too many requests", { status: 429 });
  }
  const scanId = req.nextUrl.searchParams.get("scanId");
  if (!scanId) return new Response("scanId is required", { status: 400 });

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: {
      status: true,
      readinessScore: true,
      skinScore: true,
      hairScore: true,
      beardScore: true,
      styleScore: true,
      focusAreas: true,
      weddingDate: true,
      client: { select: { weddingDate: true } },
    },
  });
  if (!scan || scan.status !== "scored" || scan.readinessScore == null) {
    return new Response("Not found", { status: 404 });
  }

  const focus = (scan.focusAreas as { area: string }[] | null)?.[0]?.area ?? null;
  const svg = await satori(
    card({
      readiness: scan.readinessScore,
      days: Math.max(0, daysUntil(scan.client?.weddingDate ?? scan.weddingDate)),
      scores: {
        skin: scan.skinScore ?? 0,
        hair: scan.hairScore ?? 0,
        beard: scan.beardScore ?? 0,
        style: scan.styleScore ?? 0,
      },
      focus,
    }) as unknown as React.ReactNode,
    { width: WIDTH, height: HEIGHT, fonts: loadFonts() },
  );
  const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Days-to-wedding drifts, so cache for a day rather than forever.
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export const GET = withRequestLog(handleGet);

/**
 * Gemini vision adapter — the single place any model provider is called.
 *
 * One provider (Google Gemini) covers every vision task; all calls go through
 * this module with our own input/output types, so swapping or A/B-ing a
 * provider later is a one-file change. Never called from the client.
 *
 * Degrades gracefully like the mailer: with no GEMINI_API_KEY the adapter
 * returns deterministic stub scores (seeded from the photo bytes, so the same
 * photo always scores the same) tagged modelVersion "stub" — the full funnel is
 * testable without a key.
 *
 * Safety: the response schema scores appearance attributes only — it has no
 * field a medical diagnosis could fit in, and the rubric forbids condition
 * language. "Analysis, not diagnosis" is enforced structurally.
 */
import {
  SCAN_ATTRIBUTE_KEYS,
  attributeLabel,
  computeAppearanceReadiness,
  type FocusArea,
  type ScanAttribute,
  type ScanClientType,
} from "@gtb/shared";

export type ScanPhotoAngle = "front" | "left" | "right" | "full_body";

export interface ScanPhotoInput {
  angle: ScanPhotoAngle;
  data: Buffer;
  mimeType: string;
}

export interface ScanFraming {
  /** A human face is present in the front photo. */
  faceDetected: boolean;
  /** The face fills enough of the frame to score skin/beard reliably. */
  isCloseUp: boolean;
  /** Hair is visible and not cropped out of frame. */
  hairVisible: boolean;
}

export interface ScanAnalysis {
  framing: ScanFraming;
  scores: {
    skinScore: number;
    hairScore: number;
    /** Beard for grooms; brows & lashes for brides (same column). */
    beardScore: number;
    /** Only scored when a full-body photo is present. */
    styleScore: number | null;
    /** Appearance readiness (weights renormalized when Style is absent). */
    readinessScore: number;
  };
  attributes: ScanAttribute[];
  focusAreas: FocusArea[];
  highlights: string[];
  suggestions: string[];
  modelVersion: string;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
const API_KEY = process.env.GEMINI_API_KEY ?? "";

export const geminiConfigured = Boolean(API_KEY);

// ---------------------------------------------------------------------------
// Schema + rubric
// ---------------------------------------------------------------------------

function responseSchema(type: ScanClientType) {
  const attributeProps = Object.fromEntries(
    SCAN_ATTRIBUTE_KEYS[type].map(([key, label]) => [
      key,
      { type: "INTEGER", description: `0-100 appearance rating: ${label}` },
    ]),
  );
  return {
    type: "OBJECT",
    properties: {
      faceDetected: { type: "BOOLEAN", description: "a human face is present in the FRONT photo" },
      isCloseUp: {
        type: "BOOLEAN",
        description:
          "in the FRONT photo the face fills roughly a third or more of the frame height",
      },
      hairVisible: { type: "BOOLEAN", description: "head hair is visible, not cropped out" },
      skinScore: { type: "INTEGER", description: "0-100 skin appearance rating" },
      hairScore: { type: "INTEGER", description: "0-100 hair appearance rating" },
      beardScore: {
        type: "INTEGER",
        description:
          type === "bride"
            ? "0-100 brows & lashes grooming rating"
            : "0-100 beard/facial-hair appearance rating",
      },
      styleScore: {
        type: "INTEGER",
        description:
          "0-100 outfit/fit/presentation rating from the FULL-BODY photo; exactly -1 when no full-body photo was provided",
      },
      attributes: {
        type: "OBJECT",
        description: "attribute-level appearance ratings, all 0-100",
        properties: attributeProps,
        required: Object.keys(attributeProps),
      },
      focusAreas: {
        type: "ARRAY",
        description: "2-4 focus areas, weights summing to 100",
        items: {
          type: "OBJECT",
          properties: { area: { type: "STRING" }, weight: { type: "INTEGER" } },
          required: ["area", "weight"],
        },
      },
      highlights: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "2-3 genuine positives",
      },
      suggestions: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "3-5 actionable grooming suggestions",
      },
    },
    required: [
      "faceDetected",
      "isCloseUp",
      "hairVisible",
      "skinScore",
      "hairScore",
      "beardScore",
      "styleScore",
      "attributes",
      "focusAreas",
      "highlights",
      "suggestions",
    ],
  } as const;
}

function rubric(type: ScanClientType, angles: ScanPhotoAngle[]): string {
  const who = type === "bride" ? "bride-to-be" : "groom-to-be";
  const thirdCategory =
    type === "bride"
      ? "- beardScore (BROWS & LASHES for a bride): brow shape and tidiness, lash definition, overall eye-area grooming."
      : "- beardScore: edge definition, evenness, tidiness (a deliberately clean-shaven face with clean edges scores high).";
  const attrs = SCAN_ATTRIBUTE_KEYS[type].map(([k, l]) => `  - ${k}: ${l}`).join("\n");
  const hasBody = angles.includes("full_body");
  const photoList = angles.map((a, i) => `Photo ${i + 1}: ${a.replace("_", " ")} view`).join("; ");

  return `You are a professional wedding-grooming consultant scoring photos of a ${who} for a "Transformation Readiness" report. Score APPEARANCE only — you are not a medical professional and must never name, imply, or hint at any medical or dermatological condition. Score what a portrait photographer would notice.

You receive ${angles.length} photo(s), in this order: ${photoList}. The FRONT photo is primary; side views refine hair and ${type === "bride" ? "brow" : "beard"} scores; the full-body photo is the ONLY basis for styleScore.

First, validate framing on the FRONT photo — the scan requires a CLOSE-UP of one person's face WITH their hair in frame:
- faceDetected: false if there is no clear human face (objects, pets, groups, memes → false).
- isCloseUp: true only if the face fills roughly a third or more of the frame height — a full-body or waist-up photo is NOT a close-up.
- hairVisible: false if the top of the head/hair is cropped out of frame or fully covered.
If any of these is false, still fill every score field with 0 — the scores will be discarded.

Category rubric (each 0-100, where 50 is a typical unprepared selfie and 85+ is photo-shoot ready):
- skinScore: evenness of tone, hydration/texture appearance, visible shine or dullness, under-eye appearance.
- hairScore: neatness, apparent health/shine, how well the current cut frames the face.
${thirdCategory}
- styleScore: outfit fit, colour harmony with skin tone, overall put-together presentation — judged from the FULL-BODY photo ONLY. ${hasBody ? "A full-body photo IS provided: score it." : "NO full-body photo was provided: return exactly -1."}

Attribute ratings (each 0-100, appearance only, same anchors):
${attrs}

Also return:
- focusAreas: the 2-4 appearance areas that would most improve wedding photos, with integer weights summing to 100 (e.g. "even skin tone" 60, "hydration" 25, "${type === "bride" ? "brow shaping" : "beard shaping"}" 15). Use plain appearance words, never condition names.
- highlights: 2-3 genuine, specific positives.
- suggestions: 3-5 actionable grooming/routine suggestions (product-category level, never brands or medication).

Be consistent: identical photos must produce identical scores. Anchor to the rubric, not to relative impressions.`;
}

interface GeminiRawResult {
  faceDetected: boolean;
  isCloseUp: boolean;
  hairVisible: boolean;
  skinScore: number;
  hairScore: number;
  beardScore: number;
  styleScore: number;
  attributes: Record<string, number>;
  focusAreas: FocusArea[];
  highlights: string[];
  suggestions: string[];
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// ---------------------------------------------------------------------------
// Analyze
// ---------------------------------------------------------------------------

/** Analyze a scan's photos. Throws on provider errors (caller marks the scan failed). */
export async function analyzeScan(args: {
  type: ScanClientType;
  photos: ScanPhotoInput[];
}): Promise<ScanAnalysis> {
  const { type } = args;
  // Front first, then the rest in a stable order the rubric describes.
  const order: ScanPhotoAngle[] = ["front", "left", "right", "full_body"];
  const photos = [...args.photos].sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle));
  const angles = photos.map((p) => p.angle);
  const hasBody = angles.includes("full_body");

  if (!geminiConfigured) return stubAnalysis(type, photos, hasBody);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: rubric(type, angles) },
            ...photos.map((p) => ({
              inline_data: { mime_type: p.mimeType, data: p.data.toString("base64") },
            })),
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: responseSchema(type),
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    modelVersion?: string;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  let raw: GeminiRawResult;
  try {
    raw = JSON.parse(text) as GeminiRawResult;
  } catch {
    throw new Error("Gemini returned unparseable JSON");
  }

  const styleScore = hasBody && Number(raw.styleScore) >= 0 ? clamp(raw.styleScore) : null;
  const partial = {
    skinScore: clamp(raw.skinScore),
    hairScore: clamp(raw.hairScore),
    beardScore: clamp(raw.beardScore),
    styleScore,
  };
  const attributes: ScanAttribute[] = SCAN_ATTRIBUTE_KEYS[type]
    .filter(([key]) => raw.attributes && raw.attributes[key] != null)
    .map(([key]) => ({ key, label: attributeLabel(type, key), score: clamp(raw.attributes[key]) }));

  return {
    framing: {
      faceDetected: raw.faceDetected === true,
      isCloseUp: raw.isCloseUp === true,
      hairVisible: raw.hairVisible === true,
    },
    scores: { ...partial, readinessScore: computeAppearanceReadiness(partial) },
    attributes,
    focusAreas: (raw.focusAreas ?? [])
      .filter((f) => f && typeof f.area === "string")
      .slice(0, 4)
      .map((f) => ({ area: f.area, weight: clamp(f.weight) })),
    highlights: (raw.highlights ?? []).filter((s) => typeof s === "string").slice(0, 3),
    suggestions: (raw.suggestions ?? []).filter((s) => typeof s === "string").slice(0, 5),
    modelVersion: json.modelVersion ?? GEMINI_MODEL,
  };
}

/** Back-compat single-selfie entry point. */
export function analyzeSelfie(photo: Buffer, mimeType: string, type: ScanClientType = "groom") {
  return analyzeScan({ type, photos: [{ angle: "front", data: photo, mimeType }] });
}

// ---------------------------------------------------------------------------
// Stub
// ---------------------------------------------------------------------------

/** Deterministic dev stub: scores seeded from the photo bytes so a rescan of
 *  the same photo is stable — the consistency property the product depends on
 *  holds even without a key. */
function stubAnalysis(
  type: ScanClientType,
  photos: ScanPhotoInput[],
  hasBody: boolean,
): ScanAnalysis {
  const front = photos[0]?.data ?? Buffer.alloc(0);
  let h = 2166136261;
  const step = Math.max(1, Math.floor(front.length / 4096));
  for (let i = 0; i < front.length; i += step) {
    h = Math.imul(h ^ (front[i] ?? 0), 16777619);
  }
  const pick = (salt: number, min: number, span: number) => {
    const v = Math.abs(Math.imul(h, salt + 1) >>> 8);
    return min + (v % span);
  };
  const partial = {
    skinScore: pick(1, 55, 30),
    hairScore: pick(2, 60, 30),
    beardScore: pick(3, 50, 35),
    styleScore: hasBody ? pick(4, 45, 35) : null,
  };
  const attributes: ScanAttribute[] = SCAN_ATTRIBUTE_KEYS[type].map(([key, label], i) => ({
    key,
    label,
    score: pick(10 + i, 45, 45),
  }));
  const third = type === "bride" ? "brow shaping" : "beard shaping";
  return {
    // The stub can't see the photo, so framing always passes — real validation
    // needs GEMINI_API_KEY (the client-side FaceDetector still guards dev UX).
    framing: { faceDetected: true, isCloseUp: true, hairVisible: true },
    scores: { ...partial, readinessScore: computeAppearanceReadiness(partial) },
    attributes,
    focusAreas: [
      { area: "even skin tone", weight: 55 },
      { area: "hydration", weight: 30 },
      { area: third, weight: 15 },
    ],
    highlights: ["Good natural symmetry", "Hair has strong styling potential"],
    suggestions: [
      "Daily moisturizer, morning and night",
      "Sunscreen every morning",
      type === "bride" ? "Weekly brow tidy-up" : "Weekly beard line clean-up",
      "Drink 3L of water a day",
    ],
    modelVersion: "stub",
  };
}

/**
 * Scan pipeline eval: consistency + sanity of analyzeScan against the golden set.
 *
 *   pnpm --filter @gtb/api eval:scan            # run (stub without GEMINI_API_KEY)
 *   pnpm --filter @gtb/api eval:scan --fresh    # bypass the response cache
 *   pnpm --filter @gtb/api eval:scan --check    # also gate against evals/baselines/scan.json
 *
 * Each case runs EVAL_REPEATS times (default 3). Repeats hit the API once each
 * and are then cached forever, so re-runs after a code change that does NOT
 * touch the rubric are free; a rubric edit changes the cache key (prompt
 * fingerprint) and re-spends budget on purpose.
 *
 * Failure conditions (real runs only):
 *   - consistency: any score field's range across repeats > CONSISTENCY_TOLERANCE
 *   - expectation: a field's mean outside the manifest's [min,max]
 *   - framing: a framingRejected case that the model accepted (or vice versa)
 *   - --check: a case mean drifted > DRIFT_TOLERANCE from the committed baseline
 */
import "./lib/env-setup.js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  analyzeScan,
  geminiConfigured,
  scanRubric,
  type ScanAnalysis,
  type ScanPhotoAngle,
} from "../src/lib/gemini.js";
import {
  Budget,
  cachedCall,
  EVALS_DIR,
  fieldStats,
  flatPng,
  loadBaseline,
  noisePng,
  sha,
  writeReport,
  type EvalReport,
} from "./lib/harness.js";

const REPEATS = Number(process.env.EVAL_REPEATS ?? 3);
const CONSISTENCY_TOLERANCE = Number(process.env.EVAL_CONSISTENCY_TOLERANCE ?? 8);
const DRIFT_TOLERANCE = Number(process.env.EVAL_DRIFT_TOLERANCE ?? 10);
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

interface ManifestCase {
  id: string;
  type: "groom" | "bride";
  synthetic?: "noise" | "flat";
  photos?: { angle: ScanPhotoAngle; file: string }[];
  expect: Record<string, unknown> & { framingRejected?: boolean; styleScored?: boolean };
}

const SCORE_FIELDS = ["skinScore", "hairScore", "beardScore", "readinessScore"] as const;

function loadPhotos(
  c: ManifestCase,
): { angle: ScanPhotoAngle; data: Buffer; mimeType: string }[] | null {
  if (c.synthetic) {
    const data = c.synthetic === "noise" ? noisePng() : flatPng();
    return [{ angle: "front", data, mimeType: "image/png" }];
  }
  const photos = (c.photos ?? []).map((p) => {
    const file = path.join(EVALS_DIR, "golden", p.file);
    return existsSync(file)
      ? { angle: p.angle, data: readFileSync(file), mimeType: "image/jpeg" }
      : null;
  });
  return photos.every((p): p is NonNullable<typeof p> => p !== null) && photos.length
    ? photos
    : null;
}

async function main() {
  const manifest = JSON.parse(
    readFileSync(path.join(EVALS_DIR, "golden", "manifest.json"), "utf8"),
  ) as { cases: ManifestCase[] };
  const budget = new Budget();
  const stub = !geminiConfigured;
  // The rubric IS the prompt; its hash keys the cache and stamps the report.
  const promptFingerprint = sha(
    scanRubric("groom", ["front"]) + scanRubric("bride", ["front"]),
  ).slice(0, 12);
  const failures: string[] = [];
  const caseRows: Record<string, unknown>[] = [];

  console.log(
    `scan eval — ${manifest.cases.length} cases x ${REPEATS} repeats, model ${stub ? "STUB" : MODEL}, prompt ${promptFingerprint}\n`,
  );

  for (const c of manifest.cases) {
    const photos = loadPhotos(c);
    if (!photos) {
      caseRows.push({ id: c.id, status: "skipped", reason: "golden photo file(s) missing" });
      console.log(`- ${c.id}: SKIPPED (photos missing — see golden/README.md)`);
      continue;
    }

    const runs: ScanAnalysis[] = [];
    for (let i = 0; i < REPEATS; i++) {
      const key = JSON.stringify({
        kind: "scan",
        model: MODEL,
        prompt: promptFingerprint,
        photos: photos.map((p) => sha(p.data)),
        type: c.type,
        repeat: i,
      });
      runs.push(await cachedCall(key, budget, () => analyzeScan({ type: c.type, photos })));
    }

    const rejected = runs.map(
      (r) => !(r.framing.faceDetected && r.framing.isCloseUp && r.framing.hairVisible),
    );
    const stats = Object.fromEntries(
      SCORE_FIELDS.map((f) => [f, fieldStats(runs.map((r) => r.scores[f]))]),
    );
    const row: Record<string, unknown> = {
      id: c.id,
      status: "ran",
      rejected: rejected.filter(Boolean).length,
      repeats: REPEATS,
      stats,
      styleScored: runs.map((r) => r.scores.styleScore != null),
    };
    caseRows.push(row);

    // The stub can't see photos (framing always passes, scores are seeded
    // hashes) — expectation checks are only meaningful on real runs.
    if (stub) {
      console.log(`- ${c.id}: stub run recorded (checks skipped)`);
      continue;
    }

    // Framing expectation applies in both directions.
    if (c.expect.framingRejected != null) {
      const allMatch = rejected.every((r) => r === c.expect.framingRejected);
      if (!allMatch)
        failures.push(
          `${c.id}: expected framingRejected=${c.expect.framingRejected}, got [${rejected.join(", ")}]`,
        );
    } else {
      if (rejected.some(Boolean))
        failures.push(
          `${c.id}: framing rejected a golden photo in ${rejected.filter(Boolean).length}/${REPEATS} runs`,
        );
      // Consistency + range checks only make sense for accepted, scored runs.
      for (const f of SCORE_FIELDS) {
        const s = stats[f]!;
        if (s.range > CONSISTENCY_TOLERANCE)
          failures.push(
            `${c.id}: ${f} inconsistent across repeats — values [${s.values.join(", ")}], range ${s.range} > ${CONSISTENCY_TOLERANCE}`,
          );
        const expected = c.expect[f];
        if (Array.isArray(expected)) {
          const [min, max] = expected as [number, number];
          if (s.mean < min || s.mean > max)
            failures.push(`${c.id}: ${f} mean ${s.mean} outside expected [${min}, ${max}]`);
        }
      }
      if (c.expect.styleScored === true && runs.some((r) => r.scores.styleScore == null))
        failures.push(`${c.id}: styleScore missing despite full-body photo`);
    }
    console.log(
      `- ${c.id}: ${rejected.filter(Boolean).length}/${REPEATS} rejected; ` +
        SCORE_FIELDS.map((f) => `${f} ${stats[f]!.mean}±${stats[f]!.range}`).join(", "),
    );
  }

  // Optional drift gate against the committed baseline.
  if (process.argv.includes("--check")) {
    const baseline = loadBaseline("scan");
    if (!baseline) {
      console.log(
        "\n--check: no baseline committed yet (evals/baselines/scan.json) — skipping drift gate.",
      );
    } else {
      for (const row of caseRows) {
        if (row.status !== "ran") continue;
        const base = baseline.cases.find((b) => b.id === row.id && b.status === "ran");
        if (!base) continue;
        for (const f of SCORE_FIELDS) {
          const now = (row.stats as Record<string, { mean: number }>)[f]!.mean;
          const then = (base.stats as Record<string, { mean: number }>)[f]!.mean;
          if (Math.abs(now - then) > DRIFT_TOLERANCE)
            failures.push(
              `${row.id as string}: ${f} drifted ${then} -> ${now} (baseline ${baseline.ranAt}, tolerance ${DRIFT_TOLERANCE})`,
            );
        }
      }
    }
  }

  const report: EvalReport = {
    name: "scan",
    ranAt: new Date().toISOString(),
    model: stub ? "stub" : MODEL,
    promptFingerprint,
    stubMode: stub,
    budget: { max: budget.max, spent: budget.spent, cacheHits: budget.cacheHits },
    cases: caseRows,
    failures,
  };
  const { mdPath } = writeReport(report);
  console.log(
    `\n${failures.length === 0 ? "PASS" : `FAIL (${failures.length})`} — report: ${mdPath}`,
  );
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (stub) {
    console.log(
      "\nSTUB MODE: no GEMINI_API_KEY, so this run only verified the harness plumbing. Exit 0.",
    );
    return;
  }
  if (failures.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

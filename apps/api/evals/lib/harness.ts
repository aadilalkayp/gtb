/**
 * Shared eval-harness plumbing: env loading, a disk cache so re-runs are free,
 * a hard budget on real API calls (the key is on a free tier — every runner
 * refuses to exceed EVAL_BUDGET real calls per run), stats, synthetic test
 * images, and report writing.
 *
 * Cache keys include the prompt fingerprint and model, so editing a prompt
 * naturally invalidates cached responses for it and nothing else.
 */
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EVALS_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = path.join(EVALS_DIR, ".cache");
const REPORTS_DIR = path.join(EVALS_DIR, "reports");

export const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export class Budget {
  spent = 0;
  cacheHits = 0;
  constructor(readonly max = Number(process.env.EVAL_BUDGET ?? 40)) {}
  /** Throws when a real API call would exceed the budget. */
  take(): void {
    if (this.spent >= this.max) {
      throw new Error(
        `EVAL_BUDGET exhausted (${this.max} real API calls). Raise EVAL_BUDGET or trim cases; cached results are always free.`,
      );
    }
    this.spent += 1;
  }
}

// ---------------------------------------------------------------------------
// Disk cache
// ---------------------------------------------------------------------------

const fresh = process.argv.includes("--fresh");

/** Run `fn` unless an identical call is cached. `--fresh` bypasses reads. */
export async function cachedCall<T>(key: string, budget: Budget, fn: () => Promise<T>): Promise<T> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${sha(key)}.json`);
  if (!fresh && existsSync(file)) {
    budget.cacheHits += 1;
    return JSON.parse(readFileSync(file, "utf8")) as T;
  }
  budget.take();
  const value = await fn();
  writeFileSync(file, JSON.stringify(value));
  return value;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface FieldStats {
  values: number[];
  mean: number;
  min: number;
  max: number;
  range: number;
  stddev: number;
}

export function fieldStats(values: number[]): FieldStats {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return {
    values,
    mean: Math.round(mean * 10) / 10,
    min,
    max,
    range: max - min,
    stddev: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Synthetic images (framing-rejection cases run against the real model
// without needing photos of a person)
// ---------------------------------------------------------------------------

/** Minimal valid PNG encoder: 8-bit RGB, filter 0 rows. Deterministic. */
export function encodePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let crcTable: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return crc ^ 0xffffffff;
}

/** Deterministic pseudo-noise image — no face, so framing must reject it. */
export function noisePng(seed = 7): Buffer {
  let s = seed;
  const rand = () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s % 256;
  };
  return encodePng(256, 256, () => [rand(), rand(), rand()]);
}

/** Flat colour image — no face, so framing must reject it. */
export function flatPng(): Buffer {
  return encodePng(256, 256, () => [180, 180, 180]);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface EvalReport {
  name: string;
  ranAt: string;
  model: string;
  promptFingerprint: string;
  stubMode: boolean;
  budget: { max: number; spent: number; cacheHits: number };
  cases: Record<string, unknown>[];
  failures: string[];
}

export function writeReport(report: EvalReport): { jsonPath: string; mdPath: string; md: string } {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = report.ranAt.replace(/[:.]/g, "-").slice(0, 19);
  const base = path.join(REPORTS_DIR, `${stamp}-${report.name}`);
  const latest = path.join(REPORTS_DIR, `latest-${report.name}.json`);
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  writeFileSync(latest, JSON.stringify(report, null, 2));

  const md = [
    `# ${report.name} eval — ${report.ranAt}`,
    "",
    `- Model: \`${report.model}\`${report.stubMode ? " **(STUB MODE — numbers are not meaningful; set GEMINI_API_KEY for a real run)**" : ""}`,
    `- Prompt fingerprint: \`${report.promptFingerprint}\``,
    `- API calls: ${report.budget.spent} real, ${report.budget.cacheHits} from cache (budget ${report.budget.max})`,
    `- Result: ${report.failures.length === 0 ? "PASS" : `**${report.failures.length} FAILURE(S)**`}`,
    "",
    ...(report.failures.length
      ? ["## Failures", "", ...report.failures.map((f) => `- ${f}`), ""]
      : []),
  ].join("\n");
  writeFileSync(`${base}.md`, md);
  return { jsonPath: `${base}.json`, mdPath: `${base}.md`, md };
}

export function loadBaseline(name: string): EvalReport | null {
  const p = path.join(EVALS_DIR, "baselines", `${name}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as EvalReport) : null;
}

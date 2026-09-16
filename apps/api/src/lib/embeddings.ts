/**
 * Embedding adapter + pgvector retrieval for the coach knowledge base.
 *
 * Follows the gemini.ts pattern: one provider, graceful stub without a key
 * (a deterministic hash-projection vector, so retrieval order is stable in
 * dev), and the whole vector path degrades to the caller's keyword fallback
 * if the pgvector migration hasn't been applied yet.
 *
 * The `coach_article_embeddings` table is deliberately NOT in schema.zmodel:
 * it is server-only plumbing behind this module (raw SQL migration
 * `coach_article_embeddings`), so ZenStack policies/hooks never see it.
 */
import { createHash } from "node:crypto";
import { prisma } from "@gtb/db";

const API_KEY = process.env.GEMINI_API_KEY ?? "";
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
/** Fixed at migration time (vector(768)) — changing it requires a re-embed + migration. */
export const EMBEDDING_DIMS = 768;

export const embeddingsConfigured = Boolean(API_KEY);

export interface EmbeddableArticle {
  id: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
}

const articleText = (a: EmbeddableArticle) =>
  `${a.title}\n[${a.category}] ${a.tags.join(", ")}\n\n${a.content}`;

export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");

// ---------------------------------------------------------------------------
// Embedding calls
// ---------------------------------------------------------------------------

/** Embed one text. Stub: a deterministic pseudo-random unit vector seeded from
 *  token hashes, so similar texts share some coordinates and dev ordering is
 *  stable — not semantically meaningful, but exercises the full SQL path. */
export async function embedText(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[]> {
  if (!embeddingsConfigured) return stubEmbedding(text);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 8000) }] },
      taskType,
      outputDimensionality: EMBEDDING_DIMS,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Embedding request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!values || values.length === 0) throw new Error("Embedding response had no values");
  return normalize(values.slice(0, EMBEDDING_DIMS));
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function stubEmbedding(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMS).fill(0);
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
    const idx = Math.abs(h) % EMBEDDING_DIMS;
    v[idx] = (v[idx] ?? 0) + ((Math.abs(h >> 8) % 1000) / 500 - 1);
  }
  return normalize(v);
}

/** pgvector text literal — parameterised as a string and cast with ::vector. */
const toVectorLiteral = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;

// ---------------------------------------------------------------------------
// Sync + search (both fail soft: callers fall back to keyword retrieval)
// ---------------------------------------------------------------------------

/**
 * Lazily (re-)embed articles whose content changed since their stored hash.
 * Called from the ask route on each request with a small cap, so the index
 * heals itself as staff edit articles — no admin action, no cron.
 * Returns the number embedded; -1 if the vector table isn't available.
 */
export async function syncArticleEmbeddings(
  articles: EmbeddableArticle[],
  cap = 8,
): Promise<number> {
  let existing: { articleId: string; contentHash: string }[];
  try {
    existing = await prisma.$queryRaw<{ articleId: string; contentHash: string }[]>`
      SELECT "articleId", "contentHash" FROM coach_article_embeddings`;
  } catch {
    return -1; // migration not applied — keyword fallback handles retrieval
  }
  const byId = new Map(existing.map((e) => [e.articleId, e.contentHash]));
  const stale = articles
    .map((a) => ({ a, text: articleText(a) }))
    .filter(({ a, text }) => byId.get(a.id) !== contentHash(text))
    .slice(0, cap);

  let done = 0;
  for (const { a, text } of stale) {
    try {
      const vec = toVectorLiteral(await embedText(text, "RETRIEVAL_DOCUMENT"));
      await prisma.$executeRaw`
        INSERT INTO coach_article_embeddings ("articleId", "contentHash", "embedding", "updatedAt")
        VALUES (${a.id}, ${contentHash(text)}, ${vec}::vector, NOW())
        ON CONFLICT ("articleId")
        DO UPDATE SET "contentHash" = EXCLUDED."contentHash",
                      "embedding" = EXCLUDED."embedding",
                      "updatedAt" = NOW()`;
      done += 1;
    } catch {
      break; // provider or DB hiccup — try again on a later request
    }
  }
  return done;
}

export interface VectorHit {
  articleId: string;
  similarity: number;
}

/** Cosine search over the article embeddings. Null when the vector path is
 *  unavailable (no table / no embeddings / provider error) — caller falls
 *  back to keyword ranking. */
export async function searchArticlesByVector(
  question: string,
  limit: number,
): Promise<VectorHit[] | null> {
  try {
    const vec = toVectorLiteral(await embedText(question, "RETRIEVAL_QUERY"));
    const rows = await prisma.$queryRaw<{ articleId: string; similarity: number }[]>`
      SELECT "articleId", 1 - ("embedding" <=> ${vec}::vector) AS similarity
      FROM coach_article_embeddings
      ORDER BY "embedding" <=> ${vec}::vector
      LIMIT ${limit}`;
    if (rows.length === 0) return null;
    return rows.map((r) => ({ articleId: r.articleId, similarity: Number(r.similarity) }));
  } catch {
    return null;
  }
}

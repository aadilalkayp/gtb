-- Coach KB semantic retrieval (phase 7).
--
-- Hand-written migration: this table is deliberately absent from schema.zmodel.
-- It is server-only plumbing behind apps/api/src/lib/embeddings.ts (raw SQL),
-- so ZenStack policies, generated hooks and zod schemas never see it and
-- `prisma migrate diff` will not try to drop it (prisma db push would — use
-- migrations, not push, on databases that have this applied).
--
-- pgvector ships enabled-on-demand on Supabase; plain Postgres needs the
-- extension installed. 768 dims matches GEMINI_EMBEDDING_MODEL output
-- (gemini-embedding-001 with outputDimensionality 768) — changing the model
-- or dims requires a new migration plus a re-embed (the contentHash check
-- re-embeds lazily once rows are deleted).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "coach_article_embeddings" (
    "articleId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_article_embeddings_pkey" PRIMARY KEY ("articleId"),
    CONSTRAINT "coach_article_embeddings_articleId_fkey" FOREIGN KEY ("articleId")
        REFERENCES "CoachArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- No ANN index on purpose: the KB is a few dozen rows; a sequential scan is
-- faster than maintaining ivfflat/hnsw at this size. Revisit past ~10k rows.

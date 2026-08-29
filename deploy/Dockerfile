# GTB OS API — multi-stage build for the Next.js backend (apps/api).
#
# Build context is the REPO ROOT:
#   docker build -f deploy/Dockerfile -t ghcr.io/<owner>/gtb-api:<tag> .
#
# The runner stage carries only Next's traced standalone output — no pnpm, no
# workspace source, no dev toolchain. Runtime secrets come from the container
# environment (compose env_file), never from the image.

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo

# Install with the lockfile first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @gtb/api... --filter @gtb/db... --filter @gtb/shared...

COPY packages ./packages
COPY apps/api ./apps/api

# packages/db/src/generated is gitignored — regenerate ZenStack + Prisma output.
RUN pnpm --filter @gtb/db generate \
  && pnpm --filter @gtb/db exec prisma generate --schema ./prisma/schema.prisma

# `next build` forces NODE_ENV=production and apps/api/src/lib/env.ts validates
# required vars eagerly while collecting page data. These are BUILD-TIME
# placeholders only — the server re-reads process.env at boot, so the real
# values come from the runtime environment (compose env_file).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    SUPABASE_URL="http://localhost:54321" \
    SUPABASE_ANON_KEY="build-placeholder" \
    SUPABASE_SERVICE_ROLE_KEY="build-placeholder" \
    WEB_ORIGIN="https://localhost"
RUN pnpm --filter @gtb/api build

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app app

# Standalone output is rooted at the repo root (outputFileTracingRoot), so the
# server entrypoint lives at apps/api/server.js inside it.
COPY --from=build --chown=app:app /repo/apps/api/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/api/.next/static ./apps/api/.next/static

USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/api/server.js"]

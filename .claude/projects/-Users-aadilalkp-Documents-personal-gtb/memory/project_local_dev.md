---
name: project-local-dev
description: GTB OS local dev workflow — Supabase connected, db push (not migrate), founder login, server ports
metadata:
  type: project
---

Local dev setup for GTB OS (Supabase project connected 2026-06-11):

- **Schema → DB:** use `pnpm --filter @gtb/db exec prisma db push` (NOT `migrate dev`). Supabase's managed Postgres doesn't grant the shadow-database `migrate dev` needs. Formalize migration files (via `prisma migrate diff`) before the production VPS deploy.
- **Seed:** `pnpm --filter @gtb/db seed`. Creates a founder User (email from `SEED_FOUNDER_EMAIL`, default `aadil.alkp@gmail.com`), default lead sources, expense categories, and two example plans (GTB + Glow 3-month).
- **Founder login bootstrap:** the seeded founder User has `authId = null`. To log in, a Supabase **Auth** user must exist with the SAME email (created in the Supabase dashboard → Authentication → Users → Add user, auto-confirm). `apps/api/src/lib/auth.ts` links them on first login by email.
- **Policy smoke-test:** `pnpm --filter @gtb/db exec tsx scripts/check-policies.ts` — verifies allow/deny against the live DB.
- **Ports:** API (Next.js) on **3001** (fixed — web's `VITE_API_URL` points here). Web (Vite) prefers 5173 but auto-picks a free port. CORS allows any localhost origin in dev.
- **Connection:** `.env` files use the Supabase **direct** connection (`db.<ref>.supabase.co:5432`) for both DATABASE_URL and DIRECT_URL. Runtime uses the `@prisma/adapter-pg` driver adapter; CLI uses `prisma.config.ts` datasource url.

See [[project-tech-stack]] and [[project-schema-decisions]].

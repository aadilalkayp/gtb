---
name: project-build-status
description: GTB OS build progress — what's implemented vs remaining, as of 2026-06-11
metadata:
  type: project
---

Build status for GTB OS (update as work progresses):

**Done + verified against live Supabase DB:**

- Monorepo scaffold (apps/web Vite+React, apps/api Next.js, packages/db ZenStack, packages/shared).
- Full ZenStack schema (20 models, 21 enums) + access policies — pushed to DB via `db push`, seeded.
- Auth: Supabase JWT → `/api/me` → ZenStack enhanced client; first-login email linking. Route guards, StaffLayout (dark sidebar), ClientLayout (themed), login pages, router with all routes (most still placeholders).
- API verified: health 200, auth-gating 401, policy allow/deny smoke-test passes.

- Plan Management (Task 4): `apps/web/src/pages/settings/` — PlansSettings + PlanFormModal + SettingsPage (tabs). Uses generated hooks `useFindManyPlan` etc. Route `/settings` wired. Typechecks; browser-verify pending founder login.

**Remaining (tasks 5–9):** client lifecycle + onboarding (next); payments; assignments + consultations; dashboards; then CRO tracking, team tasks, media, documents, reports, expenses, notifications, settings sub-tabs (lead sources / categories / users).

**Running servers:** API on :3001 (`pnpm --filter @gtb/api dev`), web preview (Vite, auto-port). Founder login needs a Supabase Auth user for `aadil.alkp@gmail.com` (user to create in dashboard).

**Key commands:** `pnpm db:generate` (after schema edits), `pnpm --filter @gtb/db exec prisma db push`, `pnpm --filter @gtb/db seed`. See [[project-local-dev]].

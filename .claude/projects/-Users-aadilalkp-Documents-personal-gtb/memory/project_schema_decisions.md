---
name: project-schema-decisions
description: Non-obvious GTB OS data-layer decisions — Prisma 6 requirement, auth model, money as Int, enum-literal collision gotcha
metadata:
  type: project
---

Key decisions in `packages/db/schema.zmodel` (the ZenStack schema) that aren't obvious from reading code:

- **On Prisma 7** (per user request, 2026-06-11). ZenStack 2.22 prints _"Prisma 7 support is untested and not planned"_ — BUT it is now **verified working against a live Supabase DB**: `prisma db push`, seed (runtime adapter), the HTTP API chain, and a ZenStack policy allow/deny smoke-test (`packages/db/scripts/check-policies.ts`) all pass. Caveat downgraded to low risk. Fallbacks if a future Prisma-7 edge case bites: Prisma 6 (was clean) or ZenStack v3 beta (`3.0.0-beta`). Do NOT go below Prisma 6 — the Zod plugin emits Prisma-6+ type names (`ScalarRelationFilter`); Prisma 5 won't compile.
- **Prisma 7 specifics:** no `url` in the schema `datasource` block (just `provider`). Connection URLs live in `packages/db/prisma.config.ts` (CLI/migrate, uses `DIRECT_URL` via a `@prisma/adapter-pg` factory) and at runtime via a `PrismaPg` driver adapter passed to `new PrismaClient({ adapter })` (uses pooled `DATABASE_URL`), in `packages/db/src/index.ts`. Generator stays `prisma-client-js` (ZenStack-generated code imports from `@prisma/client`).
- **Single `User` model is the auth principal** for BOTH staff and clients (`@@auth`). Clients get `role = client` plus a 1:1 `Client` profile via `Client.userId`. Auth context passed to `enhance()` is just `{ id, role }` (+ index signature for ZenStack's contract).
- **Access policies only read scalar `auth().id` / `auth().role`.** "Assigned staff" is expressed by traversing the _queried_ model's relations (e.g. `client.assignments?[staffId == auth().id && isActive]`), never by loading relations onto `auth()`. "Client self" = `<...>.userId == auth().id`.
- **Enum-literal collision gotcha:** the bare enum value `client` collides with relation fields named `client`. Don't write `role != client` on models that have a `client` relation — use an explicit positive staff-role list instead. This bit us during generation.
- **Money is stored as `Int` (whole INR rupees)**, not Decimal — keeps JSON/runtime simple across the TanStack hooks. Installment splits floor and put the remainder on installment #1.
- **Generated artifacts** (gitignored): hooks → `packages/db/src/generated/hooks`, zod → `.../zod`, Prisma schema → `packages/db/prisma/schema.prisma`. Regenerate with `pnpm db:generate`.

See [[project-tech-stack]] and [[project-gtb-overview]].

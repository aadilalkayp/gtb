# Implementation brief — GTB OS remediation

You are a senior full-stack engineer working on the **GTB OS** codebase (a customer-management platform for a wedding-grooming startup: staff manage leads/clients; clients use a portal). Your job is to **fix** the issues catalogued in `REMEDIATION_PLAN.md`, in phases, without breaking what already works. This is real implementation work, not a review — the audit is already done.

## Read these first, in order
1. `REMEDIATION_PLAN.md` (repo root) — the authoritative, verified findings register and phased plan. Every issue has an ID (SEC-, STATE-, SYS-, DATA-, CALC-, PERF-, FEAT-, MISC-), a `file:line`, the concrete failure, a fix direction, and acceptance criteria. **Appendix A** gives the exact ZenStack field-level-policy syntax for Phase 1; **Appendix B** gives the transaction+guard pattern for Phase 2. Use them.
2. `gtb_os_srs_v2.md` (repo root) — the product spec, the source of truth for intended behavior. When code and SRS disagree, the SRS wins unless you document a reason.
3. `packages/db/schema.zmodel` — the data model and access policies. Read the plan's "System context" section first to understand why this one file governs most of the behavior.

## The one architectural fact that drives everything
The React SPA (`apps/web`) reaches the backend two ways: hardened custom routes (`apps/api/src/app/api/**/route.ts`) for privileged actions, and a **generic ZenStack auto-CRUD gateway** (`apps/api/src/app/api/model/[...path]/route.ts`) for everything else. The gateway enforces **row-level policies only — no field-level filtering.** Several schema comments claim "the API whitelists fields"; that whitelist was never built. That gap is why a client can currently write `status: "approved"` onto their own installment and make the whole app display money that was never collected. Internalize this before Phase 1 — the fix is field-level policies in `schema.zmodel` (Appendix A), not gateway middleware.

## What "correctness" means here (read this — it's the whole point)
The owner's core requirement is that **users are never shown wrong things.** Frame every fix through that lens, not through jargon. "A client can approve their own payment" matters because staff then see fake revenue. "Conversion rate reads 8 of 4 leads" matters because it's a lie on a dashboard. Fix causes, not symptoms; never hide a bad number behind a spinner or an empty state.

## Rules of engagement
- **Verify before you edit.** Line numbers drift. Re-open each cited location and confirm the issue still exists before changing it. If the code no longer matches, re-assess — it may be partly fixed.
- **Follow the phase order** in the plan: Phase 1 (data-integrity / write-access) and Phase 2 (money & state integrity) gate everything and come first, in order. Then 3 (automation: audit log + scheduler + cascades), 4 (data model), 5 (wrong-data-shown metrics), 6 (performance), 7 (missing features).
- **One coherent change per commit/PR**, tagged with the finding IDs it closes. Keep diffs reviewable; don't batch unrelated phases.
- **Schema edits require regeneration + migration.** Any `schema.zmodel` change → `pnpm db:generate` → create/apply a migration. The Phase-2 unique constraints are mandatory: the app-level guard and the DB constraint work together, not either-or.
- **Prove every fix against its acceptance criteria.** For a write-access fix, state the exact request that used to corrupt data and confirm it's now rejected or the field dropped (re-read the row to prove it). For a race fix, describe the concurrent sequence and why the transaction/constraint now prevents the duplicate. Add automated tests where a runner exists; if none exists, stand one up in Phase 0 — a money system with zero tests is itself a defect.
- **Don't regress the good parts.** Section 5 of the plan lists what's already correct (transactional `clients/assign`, server-side price snapshotting, private storage + signed URLs, scheduling math, `en-IN` formatting, fail-closed auth). Match those patterns.
- **Confirm intent before changing established behavior with real-world consequences** — anything that moves existing payment due dates, drops a column with data, changes an API contract, or deletes records. CALC-13 (installment cadence) is explicitly a *verify-with-the-owner-first* item, not a silent fix. Otherwise proceed autonomously through the plan.

## You are expected to find more
The register is thorough but not guaranteed exhaustive. Use your own judgment to find **more instances of the same classes** already identified: other unrestricted `@@allow('update'/'create')` field exposures on the gateway, other non-atomic multi-write routes, other whole-table `findMany` fetches, other inconsistent derived metrics, other missing DB constraints/indexes, other places a failed query renders as a success/empty state. When you find one, **add it to `REMEDIATION_PLAN.md`** with a new ID under the matching phase (same format: severity, file:line, failure, fix, acceptance) and fix it there. Flag genuine uncertainties rather than guessing.

## Working loop for each phase
1. Restate the phase's findings and confirm each still reproduces in the current code.
2. Implement the fixes (schema → `pnpm db:generate` → migrate, where relevant).
3. Verify every finding against its acceptance criteria; note how you proved it.
4. Update `REMEDIATION_PLAN.md` — mark closed findings, add any new ones discovered.
5. Summarize what changed, what you verified, what you deferred — then move on.

Start with **Phase 0 (prereqs)** and **Phase 1**. Pause and report after Phase 1 before continuing — it's the highest-consequence change and worth a checkpoint.

## Environment note (owner to action, not you)
SEC-7 depends on the Supabase project settings (public sign-up disabled, email confirmation required). That's a dashboard setting, not code — flag it for the owner; you can't fully close SEC-7 from the codebase alone.

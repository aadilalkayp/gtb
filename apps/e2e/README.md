# @gtb/e2e — Playwright end-to-end suite

Full-coverage browser tests for GTB OS: every role, every module, real
Supabase auth, real uploads, real money flows.

## Quick start

```bash
pnpm e2e          # run everything (boots its own stack + servers)
pnpm e2e:ui       # Playwright UI mode for writing/debugging
pnpm e2e:report   # open the last HTML report
```

First run downloads the Supabase images and a Chromium build; later runs
start in seconds.

## How it works

- **Isolated environment.** `setup/bootstrap.ts` (globalSetup) starts a
  dedicated Supabase stack — `project_id gtb_e2e`, ports **545xx** — wholly
  separate from the dev stack (`supabase start`, 544xx). It wipes the e2e
  database, runs `prisma migrate deploy` + the seed, creates the storage
  buckets, provisions one confirmed auth user per staff role, and saves a
  signed-in `storageState` per role under `.auth/`. Playwright then launches
  the API on **:3105** and the web app on **:5185** with env pointing at the
  e2e stack. Your dev servers, dev database, and `.env` files are never
  touched, and `pnpm e2e` can run while `pnpm dev` is up.
- **Auth.** Tests never log in through the UI except where login itself is
  under test. Each spec opens pre-authenticated pages via `asRole("cro")` /
  `pageAs(browser, "founder")`; client-portal pages come from the journey
  fixtures (`portalPage(browser)`).
- **Project order.** `auth-check` (all 8 roles' sessions valid, first-login
  linking) → `journey` (the full lead → active-client story; persists the
  shared client) → `modules` (everything else, files in parallel).
- **Reporting.** HTML report with screenshots/videos/traces on failure
  (`playwright-report/`), JUnit XML in CI, GitHub annotations + a job summary
  on PRs (`.github/workflows/e2e.yml`), report uploaded as an artifact.

## Writing specs

Read [SPEC_GUIDE.md](./SPEC_GUIDE.md) — selector patterns for this codebase
(`field()`, modal names, hidden file inputs), data-ownership rules, and which
flows may touch the shared journey client.

## Stack management

```bash
pnpm --filter @gtb/e2e stack:start   # start the gtb_e2e stack manually
pnpm --filter @gtb/e2e stack:stop    # stop it (keeps data)
pnpm --filter @gtb/e2e stack:reset   # wipe the e2e database (schema kept)
```

The stack stays up between runs (startup is the slow part); every `pnpm e2e`
wipes and reseeds the database, so runs are deterministic regardless.

## Troubleshooting

- **Port already in use (3105/5185):** a previous run's dev server is still
  alive — kill it or let `reuseExistingServer` pick it up (local only).
- **`supabase start` slow/failing:** Docker must be running; first boot pulls
  images. `docker ps | grep gtb_e2e` to inspect.
- **A spec can't find a row another spec created:** that's by design — specs
  own their data (see SPEC_GUIDE.md); don't depend on sibling specs.

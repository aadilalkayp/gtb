# GTB OS — Deployment Guide

> **Automated pipeline:** deployment is now automated — push to `main` and GitHub
> Actions checks, builds, migrates, and deploys everything. See
> [`deploy/README.md`](./deploy/README.md) for the pipeline, Docker, and the Ansible
> playbook that provisions/hardens the VPS. This document remains the reference for
> env vars, Supabase setup, and as the manual fallback.

Production deployment for the two runtime pieces:

| Piece        | App        | Tech                      | Target                        |
| ------------ | ---------- | ------------------------- | ----------------------------- |
| **Frontend** | `apps/web` | Vite + React (SPA)        | **Cloudflare Pages**          |
| **Backend**  | `apps/api` | Next.js 15 (:3001)        | **VPS** — Docker behind Nginx |
| **Data**     | —          | Postgres + Auth + Storage | **Supabase** (managed)        |

```
            ┌────────────────────┐         ┌──────────────────────────┐
  Browser ─▶│ Cloudflare Pages   │  HTTPS  │ VPS                      │
            │ app.yourdomain.com │────────▶│ Nginx :443               │
            │ (static SPA)       │  /api/* │   └─▶ docker ─▶ next :3001│
            └─────────┬──────────┘         └────────────┬─────────────┘
                      │ supabase-js (auth, anon reads)  │ prisma / service-role
                      └──────────────┬──────────────────┘
                                     ▼
                            ┌──────────────────┐
                            │ Supabase         │
                            │ Postgres · Auth  │
                            │ Storage          │
                            └──────────────────┘
```

The SPA calls the API for **all** data (ZenStack hooks hit `${VITE_API_URL}/api/model`),
so every request is cross-origin — CORS on the backend and the API URL baked into the
frontend both matter. Details below.

---

## 0. Prerequisites

- Node **20+** and pnpm **11** — pinned via `packageManager` in `package.json`;
  `corepack enable` activates that exact version automatically.
- A domain with two subdomains, e.g. `app.yourdomain.com` (frontend) and
  `api.yourdomain.com` (backend)
- A Supabase project
- A Cloudflare account (Pages)
- A VPS (Ubuntu 22.04+ assumed) with `sudo`

> ⚠️ **One non-obvious build rule for the whole repo:** the ZenStack/Prisma client and
> hooks under `packages/db/src/generated/` are **git-ignored and there is no `postinstall`
> hook**. You **must** run `pnpm db:generate` after every `pnpm install` and before any
> `build` or `typecheck`, on **both** the VPS and Cloudflare. Every command sequence in
> this guide already includes it — don't skip it.

---

## 1. Supabase setup (do this first)

Both runtimes point at the same Supabase project.

1. **Get credentials** — Dashboard → Project Settings:
   - **API**: Project URL, `anon` key, `service_role` key
   - **Database → Connection string**: the **pooled** URI (port `6543`, `?pgbouncer=true`)
     for runtime, and the **direct** URI (port `5432`) for migrations.

2. **Apply the schema** from your machine or the VPS (uses the committed migration in
   `packages/db/prisma/migrations/`). Create `packages/db/.env`:

   ```bash
   DATABASE_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres"
   ```

   ```bash
   pnpm install
   pnpm db:generate
   pnpm --filter @gtb/db migrate:deploy   # prisma migrate deploy (uses DIRECT_URL)
   pnpm --filter @gtb/db seed             # optional: founder account, lead sources, sample plans
   ```

3. **Storage** — create **private** buckets named exactly `client-documents` (payment
   proofs, photos) and `scan-photos` (Transformation Readiness Scan selfies — separate bucket
   because anonymous scans are purged after 24h by the daily cron). No bucket RLS needed;
   the API writes to both with the service-role key.

4. **Auth** — Authentication → URL Configuration: set **Site URL** to
   `https://app.yourdomain.com` and add it (plus `https://app.yourdomain.com/**`) to
   **Redirect URLs**, so invitation / registration links resolve to the live SPA.

---

## 2. Backend — VPS + Docker + Nginx

> Provisioning, hardening, nginx, TLS, and the running container are all managed
> by the Ansible playbook — see [`deploy/README.md`](./deploy/README.md). The
> subsections below remain as the **reference for env vars** (§2.3 is templated
> into `/opt/gtb/gtb-api.env` by Ansible) and for understanding the moving parts;
> none of them are run by hand anymore.

### 2.2 Code & migrations

Nothing is cloned or built on the VPS: CI builds the Docker image
(`deploy/Dockerfile`) and applies migrations (`prisma migrate deploy` with
`DIRECT_URL`) before rolling the container.

### 2.3 Backend env

Create `apps/api/.env` with production values — **before building**. `next build`
forces `NODE_ENV=production`, and `apps/api/src/lib/env.ts` validates required vars
_eagerly at module load_; every API route imports it transitively, so a build with this
file missing or incomplete fails with `Error: Missing required env var: ...` while
"Collecting page data". This is a **separate file** from `packages/db/.env` (§1) — both
are needed.

```bash
# ---- Database ----
DATABASE_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres"

# ---- Supabase ----
SUPABASE_URL="https://<ref>.supabase.co"
SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # server only — never ships to the browser
SUPABASE_JWT_SECRET="<jwt-secret>"

# ---- Gemini (Transformation Readiness Scan; optional — if unset, scans use a
# ----          deterministic stub scorer, fine for testing, never for launch) ----
GEMINI_API_KEY="<google-ai-studio-key>"
GEMINI_MODEL="gemini-2.5-flash"        # optional; this is the default

# ---- Mailgun SMTP (optional; if unset, invite links are shown in the UI to copy) ----
MAILGUN_SMTP_HOST="smtp.mailgun.org"
MAILGUN_SMTP_PORT="587"
MAILGUN_SMTP_USER="postmaster@<your-domain>.mailgun.org"
MAILGUN_SMTP_PASSWORD="<smtp-password>"
MAIL_FROM="GTB OS <no-reply@yourdomain.com>"

# ---- App URLs / CORS ----
NODE_ENV="production"
WEB_ORIGIN="https://app.yourdomain.com"          # exact origin(s), comma-separated; drives CORS
API_PUBLIC_URL="https://api.yourdomain.com"
WEB_PUBLIC_URL="https://app.yourdomain.com"      # used in invite/registration email links

# ---- Logging (optional) ----
LOG_LEVEL="info"        # debug|info|warn|error; default info in production.
                        # Production logs are JSON lines (one object per line) on
                        # stdout/stderr — see apps/api/src/lib/logger.ts. Every request
                        # gets one access line with reqId/method/path/status/durMs/userId;
                        # the reqId is echoed in the x-request-id response header.
```

> `WEB_ORIGIN` must be the **exact** frontend origin (scheme + host, no trailing slash).
> The API sends `Access-Control-Allow-Credentials: true`, so a `*` origin won't work for
> authenticated calls — list the real domain(s).

### 2.4 The running container

The API runs as the `gtb-api` container (image from GHCR, compose file at
`/opt/gtb/compose.yml`, secrets in `/opt/gtb/gtb-api.env`), bound to
`127.0.0.1:3001` only. `restart: unless-stopped` + the Docker daemon's systemd
unit survive reboots; the container healthcheck hits `/api/health`.

Sanity check it's up locally before wiring Nginx:

```bash
curl -s http://127.0.0.1:3001/api/health     # → {"status":"ok","service":"gtb-os-api",...}
```

### 2.5 Nginx reverse proxy

`/etc/nginx/sites-available/gtb-api`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # Document uploads (payment proofs / photos) stream through the API — raise the cap.
    client_max_body_size 25M;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 60s;
    }
}
```

> **Do not add CORS headers in Nginx.** The Next.js app already sets them per-request from
> `WEB_ORIGIN` (see `apps/api/src/lib/cors.ts`); duplicating them here produces invalid
> double `Access-Control-Allow-Origin` headers and breaks the browser.

```bash
sudo ln -s /etc/nginx/sites-available/gtb-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 2.6 TLS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com    # adds 443 + auto-renew
```

Verify end-to-end: `curl -s https://api.yourdomain.com/api/health`.

---

## 3. Frontend — Cloudflare Pages

The web app is a static Vite SPA. `apps/web/public/_redirects` already contains
`/* /index.html 200`, so client-side routing works on Pages with no extra config.

### 3.1 Create the Pages project

Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**, pick the
repo, then set **Build settings**:

| Setting                | Value                                              |
| ---------------------- | -------------------------------------------------- |
| Framework preset       | None                                               |
| Root directory         | `/` (repo root — it's a pnpm monorepo)             |
| Build command          | `pnpm db:generate && pnpm --filter @gtb/web build` |
| Build output directory | `apps/web/dist`                                    |

Cloudflare auto-detects pnpm from `pnpm-lock.yaml` and runs `pnpm install` before the
build command. The build command then runs the mandatory `db:generate` and builds only
the web package.

### 3.2 Frontend env vars

Settings → **Environment variables** (Production, and Preview if you use it). These are
**baked in at build time** — changing one requires a redeploy:

```
NODE_VERSION          = 20
VITE_SUPABASE_URL     = https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY= <anon-key>
VITE_API_URL          = https://api.yourdomain.com
```

> Only the **anon** Supabase key goes here — never the service-role key. `VITE_API_URL`
> must point at the live backend (no trailing slash); the ZenStack hooks call
> `${VITE_API_URL}/api/model`.

### 3.3 Custom domain

Pages project → **Custom domains** → add `app.yourdomain.com`. Cloudflare provisions the
cert automatically. Confirm this value matches `WEB_ORIGIN` / `WEB_PUBLIC_URL` on the
backend exactly.

---

## 4. Cross-checks (the wiring that bites)

These three must agree or you'll see CORS errors or broken email links:

| Frontend (Cloudflare)                         | Backend (`apps/api/.env`)                       |
| --------------------------------------------- | ----------------------------------------------- |
| Custom domain `app.yourdomain.com`            | `WEB_ORIGIN` = `https://app.yourdomain.com`     |
| `VITE_API_URL` = `https://api.yourdomain.com` | API served at that host via Nginx               |
| (registration links land here)                | `WEB_PUBLIC_URL` = `https://app.yourdomain.com` |

Plus Supabase Auth **Site URL / Redirect URLs** = `https://app.yourdomain.com`.

---

## 5. Smoke test

1. `https://api.yourdomain.com/api/health` → `{"status":"ok",...}`
2. Open `https://app.yourdomain.com`, log in with the seeded founder account.
3. DevTools → Network: data calls to `…/api/model/*` return `200` with an
   `access-control-allow-origin` header echoing your app domain (no CORS errors).
4. Upload a document somewhere in onboarding → confirm the object appears in the
   `client-documents` Storage bucket.
5. Send a staff/client invite → confirm the email arrives (or the copyable link appears
   if Mailgun is intentionally unset).

---

## 6. Redeploy / update runbook

Deploy = **push to `main`** — GitHub Actions checks, builds, migrates, and rolls
both halves. Rollback, log locations, and day-2 commands: [`deploy/README.md`](./deploy/README.md).

Handy on the VPS: `docker logs -f gtb-api` · `docker ps` · `journalctl -u gtb-cron.service`.

---

## 7. Gotchas

- **Forgot `pnpm db:generate`** → `tsc`/`vite`/`next build` fail on missing
  `@gtb/db` generated types or hooks. It is required on every fresh checkout (nothing
  runs it automatically).
- **`next build` fails with `Error: Missing required env var: DATABASE_URL`** (during
  "Collecting page data", e.g. for `/api/clients/activate`) → `apps/api/.env` doesn't
  exist yet or is missing that key. `apps/api/src/lib/env.ts` validates required vars
  eagerly at module load under `NODE_ENV=production` (which `next build` always sets),
  and every API route imports it transitively. Create `apps/api/.env` (§2.3) — a file
  separate from `packages/db/.env` — then re-run the build.
- **`ERR_PNPM_IGNORED_BUILDS` (prisma/zenstack/esbuild/sharp builds skipped)** → on
  pnpm **11+** the allowlist is the `allowBuilds` (`name: true`) map in
  `pnpm-workspace.yaml`; the old `onlyBuiltDependencies` list **and** the `package.json`
  `"pnpm"` field are both ignored. The repo pins `pnpm@11.6.0` via `packageManager` to
  keep this consistent. If a fresh checkout still blocks (builds were recorded as
  skipped on an earlier install, so a no-op `pnpm install` won't re-run them), run
  `pnpm approve-builds --all` once — it writes `allowBuilds` and runs the scripts
  non-interactively.
- **CORS errors in the browser** → `WEB_ORIGIN` doesn't exactly match the Pages origin,
  or CORS was also added in Nginx (remove it — the app owns CORS).
- **Migrations** use `DIRECT_URL` (port 5432); the **runtime** uses the pooled
  `DATABASE_URL` (port 6543, `pgbouncer=true`). Don't swap them.
- **Uploads fail at ~1 MB** → raise `client_max_body_size` in Nginx (set to `25M` above).
- **Changed a `VITE_*` value but nothing changed** → those are compile-time; update the
  repo Actions **variable** and re-run the Deploy workflow.
- **API 500s on boot in prod** → a required env var is missing; in production
  `apps/api/src/lib/env.ts` throws instead of warning. Check `docker logs gtb-api`.

# GTB OS — Deployment Guide

Production deployment for the two runtime pieces:

| Piece        | App        | Tech                | Target                          |
| ------------ | ---------- | ------------------- | ------------------------------- |
| **Frontend** | `apps/web` | Vite + React (SPA)  | **Cloudflare Pages**            |
| **Backend**  | `apps/api` | Next.js 15 (:3001)  | **VPS** — PM2 behind Nginx      |
| **Data**     | —          | Postgres + Auth + Storage | **Supabase** (managed)    |

```
            ┌────────────────────┐         ┌──────────────────────────┐
  Browser ─▶│ Cloudflare Pages   │  HTTPS  │ VPS                      │
            │ app.yourdomain.com │────────▶│ Nginx :443               │
            │ (static SPA)       │  /api/* │   └─▶ PM2 ─▶ next :3001   │
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

- Node **20+** and pnpm **10+** (`corepack enable && corepack prepare pnpm@10 --activate`)
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

3. **Storage** — create a **private** bucket named exactly `client-documents`. No bucket
   RLS needed; the API writes to it with the service-role key (payment proofs, photos).

4. **Auth** — Authentication → URL Configuration: set **Site URL** to
   `https://app.yourdomain.com` and add it (plus `https://app.yourdomain.com/**`) to
   **Redirect URLs**, so invitation / registration links resolve to the live SPA.

---

## 2. Backend — VPS + PM2 + Nginx

### 2.1 Server packages

```bash
sudo apt update && sudo apt install -y nginx git
corepack enable && corepack prepare pnpm@10 --activate   # if not already
sudo npm i -g pm2
```

### 2.2 Get the code & build

```bash
sudo mkdir -p /var/www/gtb-os && sudo chown $USER:$USER /var/www/gtb-os
git clone <your-repo-url> /var/www/gtb-os
cd /var/www/gtb-os

pnpm install --frozen-lockfile
pnpm db:generate                         # MANDATORY — generates Prisma client + hooks
pnpm --filter @gtb/db migrate:deploy     # safe to re-run; no-op if already applied
pnpm --filter @gtb/api build             # produces apps/api/.next
```

### 2.3 Backend env

Next.js auto-loads `.env` from the app directory at `next start`. Create
`apps/api/.env` with production values:

```bash
# ---- Database ----
DATABASE_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres"

# ---- Supabase ----
SUPABASE_URL="https://<ref>.supabase.co"
SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # server only — never ships to the browser
SUPABASE_JWT_SECRET="<jwt-secret>"

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
```

> `WEB_ORIGIN` must be the **exact** frontend origin (scheme + host, no trailing slash).
> The API sends `Access-Control-Allow-Credentials: true`, so a `*` origin won't work for
> authenticated calls — list the real domain(s).

### 2.4 Run under PM2

`ecosystem.config.cjs` is committed at the repo root — no editing needed (it resolves
paths from its own location, so it works regardless of where you cloned the repo).
Secrets are **not** in it; they come from `apps/api/.env` (previous step).

```bash
pm2 start ecosystem.config.cjs
pm2 save                       # persist process list
pm2 startup                    # print the systemd command to run once, so PM2 survives reboot
```

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

| Setting                    | Value                                            |
| -------------------------- | ------------------------------------------------ |
| Framework preset           | None                                             |
| Root directory             | `/` (repo root — it's a pnpm monorepo)           |
| Build command              | `pnpm db:generate && pnpm --filter @gtb/web build` |
| Build output directory     | `apps/web/dist`                                  |

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

| Frontend (Cloudflare)            | Backend (`apps/api/.env`)                 |
| -------------------------------- | ----------------------------------------- |
| Custom domain `app.yourdomain.com` | `WEB_ORIGIN` = `https://app.yourdomain.com` |
| `VITE_API_URL` = `https://api.yourdomain.com` | API served at that host via Nginx |
| (registration links land here)   | `WEB_PUBLIC_URL` = `https://app.yourdomain.com` |

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

**Frontend** — push to the production branch; Cloudflare Pages rebuilds and deploys
automatically. (Roll back from the Pages **Deployments** list.)

**Backend** — on the VPS:

```bash
cd /var/www/gtb-os
git pull
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @gtb/db migrate:deploy     # only does work when there are new migrations
pnpm --filter @gtb/api build
pm2 reload gtb-api                        # zero-downtime restart
```

Handy: `pm2 logs gtb-api` · `pm2 status` · `pm2 monit`.

---

## 7. Gotchas

- **Forgot `pnpm db:generate`** → `tsc`/`vite`/`next build` fail on missing
  `@gtb/db` generated types or hooks. It is required on every fresh checkout (nothing
  runs it automatically).
- **`ERR_PNPM_IGNORED_BUILDS` (prisma/zenstack/esbuild/sharp builds skipped)** → the
  build-script allowlist must live in `pnpm-workspace.yaml` (`onlyBuiltDependencies`).
  pnpm **11 ignores** the old `"pnpm"` field in `package.json`. If you hit this, you're
  on a checkout from before that move — pull latest, then `pnpm install`.
- **CORS errors in the browser** → `WEB_ORIGIN` doesn't exactly match the Pages origin,
  or CORS was also added in Nginx (remove it — the app owns CORS).
- **Migrations** use `DIRECT_URL` (port 5432); the **runtime** uses the pooled
  `DATABASE_URL` (port 6543, `pgbouncer=true`). Don't swap them.
- **Uploads fail at ~1 MB** → raise `client_max_body_size` in Nginx (set to `25M` above).
- **Changed a `VITE_*` value but nothing changed** → those are compile-time; trigger a new
  Pages build.
- **API 500s on boot in prod** → a required env var is missing; in production
  `apps/api/src/lib/env.ts` throws instead of warning. Check `pm2 logs gtb-api`.

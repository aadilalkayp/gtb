# GTB OS — Deployment Pipeline

Automated deployment for the whole product. The manual runbook in
[`../DEPLOYMENT.md`](../DEPLOYMENT.md) remains the reference for env vars and
Supabase setup; this directory is the automation that replaces its hands-on steps.

```
 push to main
     │
     ▼
 GitHub Actions ── check: typecheck + lint + both builds (also runs on PRs)
     ├─ deploy-web: vite build ─▶ wrangler deploy ─▶ Cloudflare Workers (static assets)
     └─ deploy-api: docker build ─▶ GHCR ─▶ prisma migrate deploy (Supabase)
                        └─▶ ssh deploy@vps ─▶ docker compose pull && up -d
```

| Piece | Mechanism |
| --- | --- |
| Web (`apps/web`) | Cloudflare **Workers static assets** (`apps/web/wrangler.jsonc`), deployed by CI |
| API (`apps/api`) | Docker image ([`Dockerfile`](./Dockerfile)) → GHCR → [`compose.yml`](./compose.yml) on the VPS |
| DB (Supabase) | `prisma migrate deploy` in CI, before the API rolls |
| VPS | Provisioned + hardened by [`ansible/site.yml`](./ansible/site.yml) |
| Daily cron | systemd timer on the VPS → `/api/cron/daily` (01:30 IST) |

## One-time setup

### 1. Provision the VPS (fresh Ubuntu 24.04)

```bash
cd deploy/ansible
cp inventory.example.ini inventory.ini                  # fill in host
cp group_vars/gtb.yml.example group_vars/gtb.yml        # fill in vars, vault the secrets
ansible-galaxy collection install community.general ansible.posix
ansible-playbook site.yml -e ansible_user=root          # first run as root (-e, not -u:
                                                        # inventory's ansible_user beats -u)
ansible-playbook site.yml                               # thereafter (as admin)
```

Point `api.yourdomain.com` DNS at the box **before** the first run (certbot needs it).
The playbook creates two users: `admin` (your key, sudo — Ansible connects as this)
and `deploy` (the CI key only, docker group, **no sudo**). Root login and password
auth are disabled; ufw allows only 22/80/443; fail2ban and unattended security
upgrades are on.

### 2. GitHub repository configuration

Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | token with Workers Scripts:Edit |
| Secret | `DIRECT_URL` | Supabase **session pooler** URL (port 5432, `postgres.<ref>@aws-0-<region>.pooler.supabase.com`) — the `db.<ref>` direct host is IPv6-only and unreachable from GitHub runners; the 6543 transaction pooler breaks migrations |
| Secret | `VPS_SSH_KEY` | private half of the `deploy` user's key |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | from the Cloudflare dashboard |
| Variable | `VITE_API_URL` | `https://api.yourdomain.com` |
| Variable | `VITE_SUPABASE_URL` | Supabase project URL |
| Variable | `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public by design) |
| Variable | `VPS_HOST` | VPS hostname/IP |
| Variable | `VPS_USER` | `deploy` |

### 3. Cloudflare

Nothing manual: the custom domain is declared in `apps/web/wrangler.jsonc`
(`routes` → `custom_domain: true`), so `wrangler deploy` provisions the DNS
record and certificate. Requires the zone to live in the same Cloudflare
account, and no other project (e.g. a legacy Pages project) may hold the
domain. If the deploy fails on the route with a permissions error, extend the
API token with Zone → DNS → Edit for the zone.

### 4. GHCR visibility

The first pushed image is private. Either keep it private (the playbook logs the
VPS into GHCR with `ghcr_token`) or make the package public and drop the token.

## Day-to-day

- **Deploy** = merge/push to `main`. PRs get the same checks without deploying.
- **Rollback**: on the VPS as `deploy`:
  `cd /opt/gtb && echo "GTB_IMAGE_TAG=<old-sha>" > .env && docker compose up -d`
  (image tags are commit SHAs; `GTB_IMAGE` is re-added from group_vars on the next
  Ansible run — or keep the line when editing). Or re-run the Deploy workflow from
  the old commit in the Actions UI.
- **Rotate secrets / change env**: edit `group_vars/gtb.yml`, re-run the playbook —
  it rewrites `/opt/gtb/gtb-api.env` and restarts the API.
- **Logs**: `docker logs -f gtb-api` · cron: `journalctl -u gtb-cron.service`
- **Cron check**: `systemctl list-timers gtb-cron.timer`

## Notes

- Migrations run **before** the new API rolls; keep them additive (no destructive
  column drops in the same release that stops using them).
- `next build` inside Docker uses placeholder env values (see Dockerfile); real
  values are injected at runtime from `/opt/gtb/gtb-api.env` (root:deploy, 0640).
- The container binds `127.0.0.1:3001` only — nginx on the host is the sole way in.
- The custom domain for the web app is declared in `apps/web/wrangler.jsonc`
  (`routes` with `custom_domain: true`) — wrangler provisions DNS + cert on deploy.

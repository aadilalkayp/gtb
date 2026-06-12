---
name: project-tech-stack
description: GTB OS tech stack decisions — Vite+React frontend on CF Pages, Next.js API on VPS, Supabase, ZenStack, TanStack Query
metadata:
  type: project
---

Tech stack confirmed 2026-06-11:

**Frontend:** Vite + React SPA, deployed to Cloudflare Pages (static)
**Backend:** Next.js API routes, deployed on VPS
**Database:** Supabase (Postgres)
**ORM:** ZenStack (Prisma-based, adds access control policies)
**Frontend data fetching:** TanStack Query
**Auth:** Supabase Auth (email/password, invitation flows)
**File storage:** Supabase Storage (payment proofs, documents, photos)
**Email:** Mailgun SMTP (invitations, notifications, reminders)
**Monorepo:** pnpm workspace

**Why:** Frontend is static SPA on CF Pages for cheap/fast hosting. Backend on VPS gives full Node.js control. ZenStack chosen for built-in role-based access policies mapped to the [[project-gtb-overview]] permission matrix. Supabase consolidates DB + auth + storage.

**How to apply:** All code lives in a pnpm workspace. Frontend talks to backend via REST API. ZenStack generates TanStack Query hooks for the frontend and access-controlled Prisma client for the backend.

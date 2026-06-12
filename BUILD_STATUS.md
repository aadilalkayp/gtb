# GTB OS — Build Status

Progress tracker for the build. Spec lives in
[`gtb_os_srs_v2.md`](./gtb_os_srs_v2.md); stack + setup in [`README.md`](./README.md).

Legend: ✅ done · 🟡 partial · 🔲 not started

---

## Status: feature-complete

All SRS modules are built and wired. `pnpm -r typecheck`, `pnpm --filter @gtb/web build`,
and `pnpm --filter @gtb/api build` all pass green. The full client lifecycle
**Lead → Converted → Active** works end to end, every staff route and the client
portal are implemented, and the dashboard/reports/alerts derive their numbers live
from the data (no background jobs required).

| Area                                                    | SRS   | Status | Key surfaces                                                                                                                       |
| ------------------------------------------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Scaffold, auth, roles/permissions                       | §3–4  | ✅     | `apps/*`, `packages/*`, `@gtb/shared` permissions                                                                                  |
| Client lifecycle                                        | §5    | ✅     | statuses + transitions enforced across the flow                                                                                    |
| Onboarding (lead→invite→register→assessment→plan→proof) | §6    | ✅     | `/clients`, `/clients/new`, `/portal/register`, `/portal/onboarding`; `/api/clients/{invite,enroll}`, `/api/documents/upload`      |
| Plan management                                         | §7    | ✅     | Settings → Plans                                                                                                                   |
| Payments — approve/reject/record + convert              | §8    | ✅     | `/payments`, `/portal/payments`; `/api/payments/{approve,reject}`. Overdue shown derived (no DB cron); receipt PDF (§8.7) deferred |
| Sessions + consultant workflow                          | §9    | ✅     | `/consultations` (complete/reschedule/missed/cancel, plan upload, calendar); `/api/sessions/{complete,reschedule}`                 |
| Styling operations + checklist                          | §10   | ✅     | `/styling-operations`                                                                                                              |
| Calendar                                                | §11   | ✅     | month calendar in `/consultations` (`MonthCalendar`)                                                                               |
| CRO tracking & follow-ups + 7-day no-contact            | §12   | ✅     | `/cro-tracking`; follow-ups seeded on activation, auto-recur on completion                                                         |
| Client satisfaction: ratings, at-risk                   | §13   | ✅     | client rates sessions in portal; at-risk derived (`lib/insights.ts`) and surfaced on profile + dashboards                          |
| Assignment + activation → Active                        | §14   | ✅     | `/assignments`; `/api/clients/{assign,activate}` (generates schedule)                                                              |
| Expenses + consultant payouts                           | §15   | ✅     | `/expenses`; payout auto-created on session completion via `ConsultantRate`                                                        |
| Document library                                        | §16   | ✅     | `/documents`, `/portal/documents`; signed-url viewing                                                                              |
| Team tasks                                              | §17   | ✅     | `/team-tasks` (drag-and-drop kanban)                                                                                               |
| Notifications & alerts                                  | §18   | ✅     | live `NotificationsBell`; `/alerts` center derives §18.3 rules (`lib/alerts.ts`)                                                   |
| Dashboards (role-aware)                                 | §19   | ✅     | `/dashboard` — founder/ops/cro/consultant/coach/media variants; `/portal` for clients                                              |
| Reports                                                 | §20   | ✅     | `/reports` — revenue/collections/sales/performance/expenses/operations, charts + CSV export                                        |
| Media                                                   | §21   | ✅     | `/media` (content kanban, filters by campaign/platform/owner)                                                                      |
| Settings / admin                                        | §22   | ✅     | Team & Users (+ `/api/staff/invite`), Plans, Lead Sources, Expense Categories                                                      |
| Client portal                                           | §19.6 | ✅     | `/portal`, `/portal/{sessions,payments,documents,profile}`                                                                         |

---

## Deferred (non-blocking)

Honest list of spec items intentionally not built — none block day-to-day use:

- **Receipt PDF (§8.7)** — payment receipts are not generated as PDF.
- **Background jobs (§8.6)** — overdue installments and at-risk are _derived at
  render_ rather than flipped by a cron; no scheduled reminders.
- **Report PDF export (§20)** — CSV export is implemented; PDF is not.
- **Notification email preferences (§18.4)** — in-app bell works for everyone;
  per-user email opt-in toggles are not configurable.
- **Media calendar view (§21.3)** — the kanban board is built; the alternate
  by-deadline calendar view is not.
- **Bundle code-splitting** — the web bundle is a single ~1.3 MB chunk (recharts +
  app). Functional, but route-level `lazy()` would trim first load.

---

## Conventions (for the next agent)

- **Writes:** client-allowed writes use the generated ZenStack hooks
  (`@gtb/db/hooks`). Staff-restricted writes go through a privileged Next.js route
  under `apps/api/src/app/api/` using the **base** `prisma` + `resolveAuthUser`.
  See `/api/clients/*`, `/api/payments/*`, `/api/sessions/*`, `/api/staff/invite`.
- **Derived business rules** live in `apps/web/src/lib/insights.ts` (overdue,
  at-risk, averages, CSV) and `apps/web/src/lib/alerts.ts` (§18.3 alert center).
  Reused by the dashboard, profile, portal, and reports — keep them the single source.
- **Dashboard data** is centralised in `apps/web/src/pages/dashboard/useDashboardData.ts`;
  role layouts + shared widgets live alongside it. The same hook powers `/alerts`.
- **Design system:** CSS variables in `index.css`, semantic Tailwind tokens, `.card`
  class, `StatCard`/`SectionCard`/`Tabs`/`PillFilter`/`ProgressRing`/`EmptyState`
  primitives. Bride theme via `data-theme="bride"`.
- **TS strictness:** `noUnusedLocals` **and** `noUncheckedIndexedAccess` are on —
  guard array index access.

## Verify

```
pnpm -r typecheck
pnpm --filter @gtb/web build
pnpm --filter @gtb/api build
```

Browser testing needs a live Supabase project + seeded staff/clients (otherwise the
app shows the login screen). Private Storage bucket `client-documents` exists; Mailgun
is optional (invites fall back to a copyable link). Not a git repo.

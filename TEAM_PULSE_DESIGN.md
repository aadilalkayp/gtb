# Team Pulse: staff activity monitoring

**Status:** Approved and fully built 2026-10-04 on branch `team-pulse-capture` (all four phases). See §16 for what changed during the build.
**Audience:** Aadil (build) and the GTB founders (product).

---

## 1. Summary

Team Pulse gives the founders a private, chronological record of what every staff member does on GTB OS:
when their day starts and ends, how much time they actually spend working in the app, what they changed,
which client records and documents they opened, and what they produced. It is visible to founders only and
is invisible to staff (no prompts, no check-in, no staff-facing screens).

It is built from three signals, all recorded on the server:

| Signal | Answers | Source | Reliability |
|---|---|---|---|
| **Audit trail** | What did they change, and when? | Every database write, captured server-side with the real actor | Exact |
| **Presence** | When did their day start/end? How long were they actively working? | First/last real request + a silent once-a-minute browser ping that only fires on real input | Exact to the minute |
| **Output** | What did they get done, and did they log it on time? | Derived from the audit trail + existing domain fields | Exact from go-live onward |

The founder sees it as a dashboard (who is working today, team timeline, per-person history) and can export a
simple report per staff member for evaluation meetings.

## 2. Goals and non-goals

**Goals**
- A trustworthy, chronological, human-readable history of each staff member's activity.
- Real start time, end time and active time per day, without any action from staff.
- Role-specific output and logging-timeliness numbers (most work happens off-platform; the app is where it is logged, so *how promptly and completely work is logged* is the fair accountability signal).
- A founder-only dashboard, and a per-staff report export (PDF + CSV).
- Close the existing audit gap: generic gateway writes (`/api/model`) currently record nothing.

**Non-goals (this version)**
- Alerts, flags, or digest emails (explicitly deferred).
- Tracking clients (portal) or anonymous scan users in Team Pulse. Their writes still land in the audit trail, but no presence tracking and no Pulse screens.
- Tracking founders' presence. Founders' *changes* are in the audit trail; founders are excluded from attendance, timelines and Pulse staff lists.
- Anything outside the app: no keystrokes, screenshots, screen time, location or device monitoring.
- A full navigation trail. Only *key views* are recorded (see §4.4).

## 3. Decisions (agreed 2026-10-04)

| Topic | Decision |
|---|---|
| Who can see it | **Founders only.** Not ops head, not the staff member themselves. Enforced server-side. |
| Staff awareness | No staff-facing UI, prompts or check-in. |
| Day start / end | Inferred: first and last activity a person caused: a heartbeat (real input), a write request, a sign-in, or a view/export event. Reads never count, so background polling and refetch-on-reconnect cannot fake a day. |
| Active time | Silent browser ping: a minute counts as active only if the tab was visible and there was real input (mouse, key, scroll, touch) in the last **3 minutes**. |
| Work day boundary | **4:00 am IST.** Activity at 1 am counts toward the previous day. |
| Granularity | All changes + key views (client profile opens, document downloads, CSV exports) + time per module. |
| Founders | In the audit trail; excluded from attendance, presence and Pulse staff views. |
| Retention | Minute-level presence: **6 months**. Daily totals and the audit trail (changes + views): **kept permanently**. |
| Export | Simple report: summary, day-by-day table, chronological activity list. PDF (print view) + CSV. One optional "Hide client names" toggle, off by default. |
| Alerts / digest | Not in this version. |

## 4. What gets recorded

### 4.1 Changes (audit trail)
Every create / update / delete on a business model, from any path (ZenStack gateway, privileged routes, domain
helpers, cron), with: actor, actor role, time (server clock), request id, entity, the client it concerns,
and a field-level before/after diff. A rule table turns raw diffs into meaningful verbs (§5.4), so
"FollowUp.status pending → completed" is shown as "Completed a follow-up with Arjun Nair".

### 4.2 Presence
- **First / last seen per work day:** the earliest and latest *counted* activity. Counted = a heartbeat, an authenticated write request (POST/PUT/PATCH/DELETE), a sign-in, or a view/export event. Reads are never counted: `NotificationsBell` polls every 60s and React Query refetches every open query when a laptop wakes and reconnects, so either would turn an idle open tab into a working day. The first input after a quiet spell sends a heartbeat immediately, so the start time is exact to the second.
- **Active minutes:** one row per staff member per active minute, tagged with the module they were in. Multiple tabs cannot double count (the minute is the primary key), and only the tab receiving input pings.

### 4.3 Sign-ins and sign-outs
- **Sign-in:** Supabase sessions survive refreshes and last for weeks, so a *new* auth session is a real sign-in (password entry or magic link). The server reads the `session_id` claim from the already-validated JWT; the first time it sees a session id it records a sign-in event with device (user agent) and IP.
- **Sign-out:** the app sends a sign-out event just before calling `supabase.auth.signOut()`. Most people close the tab instead, so the log usually shows "Last activity 18:12", which is the honest end of day.

### 4.4 Key views
| View | How it is captured |
|---|---|
| Opened a client profile (`/clients/:id`) | Browser sends a view event on route entry. Deduplicated in the database (same person + client within 30 min = one view) under an advisory lock, so simultaneous opens cannot double count |
| Downloaded / opened a document | Server-side in `documents/signed-url` (exact) |
| Exported a CSV report | Browser sends an export event from `downloadCsv` (report name, row count) |

Pages viewed in general are *not* logged individually; time per module comes from the ping.

## 5. Architecture

```
 Browser (staff only)                          API (Next.js, single container)                 Postgres (Supabase)
 ─────────────────────                         ──────────────────────────────────              ───────────────────
 normal requests ─────────────────────────────▶ withRequestLog ─▶ AsyncLocalStorage context
                                                │  resolveAuthUser: actor, session_id ─────────▶ AuthSession (sign-ins)
                                                │  write requests: touchPresence(actor) ────────▶ StaffDay (first/last seen)
                                                │
                                                ├─ ZenStack gateway ┐
                                                ├─ privileged routes ├─ prisma (extended) ─ capture ─▶ business tables
                                                └─ domain helpers   ┘        │  diff + verb rules
                                                                             ▼
                                                   on success: flush buffer ─────────────────▶ ActivityLog
 useHeartbeat (1/min if input ≤3 min) ────────▶ POST /api/heartbeat ─────────────────────────▶ ActiveMinute + StaffDay
 view / export / sign-out events ──────────────▶ POST /api/events ────────────────────────────▶ ActivityLog
 Founder UI (/team-pulse) ◀────────────────────── GET /api/pulse/* (founder-only, base prisma)
```

### 5.1 Request context
Add an `AsyncLocalStorage` request context (`apps/api/src/lib/requestContext.ts`), opened by `withRequestLog`:
`{ reqId, source: "request" | "cron", actor?: {id, role}, ip, userAgent, background: boolean, pending: AuditEntry[] }`.
`resolveAuthUser` fills `actor` (it already enriches the log line). The cron entry point opens a context with
`source: "cron"` and no actor. The existing per-request logger stays as is (it uses a `WeakMap`).

### 5.2 Change capture
A Prisma query extension on the base client in `packages/db/src/index.ts`, so **every** path is covered,
including `enhance(prisma)` for the gateway and the base client used by privileged routes and domain helpers.

For `create`, `createMany(AndReturn)`, `update`, `updateMany`, `upsert`, `delete`, `deleteMany` on non-excluded models:
1. **Before-state:** for single-row ops, `findUnique(where)` with scalar fields only; for `*Many`, `findMany(where, take: 200)`.
2. Run the operation.
3. **After-state:** the returned row (re-read by id when the caller used a narrow `select`).
4. Diff scalar fields → `{ field: [before, after] }`, dropping ignored fields. No-op updates (empty diff) are not recorded, which also drops the zero-row conditional `updateMany` guards used by the money flows.
5. Push the entry onto the request context's `pending` buffer (or write immediately when there is no context, e.g. scripts).

**Flush:** `withRequestLog` writes the buffer with one `createMany` after the handler returns a status < 400. On
failure the buffer is dropped (a failed ZenStack policy check or a thrown domain error rolls back its
transaction) and the discarded entries are written to the server log at `warn` so nothing silently vanishes.

**Excluded models:** `ActivityLog`, `ActiveMinute`, `StaffDay`, `AuthSession`, `Notification`, `OutboundMessage`,
`Scan`, `ScanPhoto`, `RoadmapItem`, `CoachConversation`, `CoachMessage`, `LookPreview`, `OutfitCheck` (system
or client-side pipeline noise).

**Ignored / redacted fields:** `createdAt`, `updatedAt`, `authId`, vector/embedding fields, any field matching
`/token|secret|password/i`; JSON values over 2 KB are stored as `"[changed, 4.1 KB]"`.

**Fallback:** if the ZenStack 2.x + Prisma 7 extension combination misbehaves (the Phase 1 spike checks this
first), capture moves to the gateway handler (model, op and args are known there) and privileged routes rely
on their semantic events. Same tables, same UI.

### 5.3 Semantic events (existing `logActivity`)
Domain helpers already write named events (payment approval/correction/rejection, enrollment, activation,
cancellation, session complete/reschedule/cancel, milestones, wedding date, proof submission). Changes:
- `logActivity` stamps `actorId`, `actorRole` and `requestId` from the context. This fixes `sessionCompletion.ts:78`, which records the *consultant* as performer even when a founder or ops head completes the session.
- These keep writing inside their transaction (atomic with the action). The generic diff rows from the same request are stored too, and the UI folds them under the semantic event as its details (same `requestId` + entity), so the founder sees one entry: "Approved ₹25,000 from Meera & Rohan", expandable to the field changes.

### 5.4 Verb rules (making gateway writes readable)
A small rule table (`packages/shared/src/activity/verbs.ts`) maps a model + diff to a verb at capture time:

| Model | Rule | Verb |
|---|---|---|
| FollowUp | create | `followup.scheduled` |
| FollowUp | status → completed | `followup.completed` |
| Task | create / status → done | `task.created` / `task.completed` |
| ContentItem | create / status change / → posted | `content.created` / `content.moved` / `content.posted` |
| StylingOperation | a `*At` checklist field set / cleared | `styling.item_done` / `styling.item_undone` |
| Client | create / status change / other | `client.created` / `client.status_changed` / `client.updated` |
| Assignment | create | `client.assigned` |
| Expense | create / → approved / → rejected | `expense.submitted` / `expense.approved` / `expense.rejected` |
| WeightLog, BodyMeasurement | create | `fitness.weight_logged`, `fitness.measurements_logged` |
| FitnessCheckIn | `trainerComment` set | `fitness.checkin_reviewed` |
| TrainerNote | create | `fitness.note_added` |
| FitnessPlan / WorkoutDay / Exercise | any | `fitness.plan_edited` |
| Document | create | `document.uploaded` |
| Plan, PlanService, LeadSource, ExpenseCategory, User, ConsultantRate | any | `settings.changed` |
| anything else | create / update / delete | `<model>.created` / `.updated` / `.deleted` |

A matching **sentence catalog** (`packages/shared/src/activity/catalog.ts`) renders each verb as a sentence,
an icon and a module, used by both the UI and the export.

### 5.5 Presence
- **`touchPresence(userId, at, counts)`** (`packages/db/src/server/presence.ts`), called for counted activity (§4.2). Keeps an in-memory `{userId → day, first, last, lastWrittenAt}` map and upserts `StaffDay` (`firstSeenAt = LEAST`, `lastSeenAt = GREATEST`) at most once a minute per user, and immediately on the first touch of a day. The API runs as one container, and the SQL is correct even if that changes.
- **No request tagging needed:** because reads never count, background polling (today `NotificationsBell`, tomorrow anything else) is ignored without any opt-out header.
- **`useHeartbeat`** (`apps/web/src/lib/heartbeat.ts`, mounted in `StaffLayout`, never in the portal, not for founders): tracks the last input time from `pointerdown`, `pointermove`, `keydown`, `wheel`, `scroll`, `touchstart`. It sends at most one `POST /api/heartbeat {module}` per wall-clock minute (`keepalive`), checked every 10s and immediately on input, while `document.visibilityState === "visible"` and the last input was ≤ 3 min ago. One beat per clock minute means no active minute is skipped. The client sends no timestamp; the server uses its own clock, truncates to the minute, and runs `INSERT ... ON CONFLICT DO NOTHING`. When a row is inserted, it increments `StaffDay.activeMinutes`.
- **Work day key:** `workDay = date_in_IST(now − 4h)`.

### 5.6 Module map
One shared map (`packages/shared/src/activity/modules.ts`) from route prefix and entity type to module:
Dashboard, Clients, Consultations, Styling, Fitness, Payments, CRO, Tasks, Documents, Expenses, Assignments,
Media, Reports, Alerts, Settings.

## 6. Data model

All new models are denied on the ZenStack gateway (`@@deny('all', true)`); they are only read by founder-only
routes using the base client, and only written by the server.

```zmodel
// Existing model, extended (additive migration; old rows stay valid).
model ActivityLog {
  id            String         @id @default(uuid())
  createdAt     DateTime       @default(now())
  entityType    String
  entityId      String
  action        ActivityAction            // kept for compatibility with existing writers
  verb          String?                   // "followup.completed", "client.viewed", ...
  kind          ActivityKind   @default(change) // change | event | view | export | auth
  module        String?
  performedById String?
  performedBy   User?          @relation("ActivityActor", fields: [performedById], references: [id])
  actorRole     Role?
  source        String?                   // request | cron | system
  requestId     String?
  clientId      String?                   // denormalised: powers the client History tab
  summary       String?
  changes       Json?                     // { field: [before, after] }
  meta          Json?                     // e.g. export: {report, rows}; auth: {ip, userAgent}

  @@index([performedById, createdAt])
  @@index([clientId, createdAt])
  @@index([requestId])
  @@index([createdAt])
  @@index([entityType, entityId])
  @@allow('read', auth().role == founder)   // was founder + ops_head
}

enum ActivityKind { change event view export auth }

model StaffDay {
  id            String   @id @default(uuid())
  userId        String
  day           DateTime @db.Date         // IST work day, 4 am boundary
  firstSeenAt   DateTime
  lastSeenAt    DateTime
  activeMinutes Int      @default(0)
  changeCount   Int      @default(0)
  viewCount     Int      @default(0)
  @@unique([userId, day])
  @@deny('all', true)
}

model ActiveMinute {
  userId  String
  minute  DateTime                        // UTC, truncated to the minute
  module  String
  @@id([userId, minute])
  @@index([minute])
  @@deny('all', true)
}

model AuthSession {
  id          String   @id               // Supabase JWT session_id
  userId      String
  firstSeenAt DateTime @default(now())
  ip          String?
  userAgent   String?
  @@index([userId, firstSeenAt])
  @@deny('all', true)
}
```

**Client resolution** for `clientId`: direct `clientId` field where the model has one (FollowUp, Session,
Assignment, Document, StylingOperation, Assessment, FitnessPlan, ...), via a lookup otherwise (Payment and
PaymentMilestone through ClientPlan; WeightLog and the like through their plan or client). Defined per model next to the verb rules.

**Volume:** roughly 10 staff × 400 active minutes = 4,000 `ActiveMinute` rows a day (about 730k at the 6-month cap),
and a few hundred `ActivityLog` rows a day. Small for Postgres.

## 7. Derived metrics

### 7.1 Per day (per staff member)
- **Start / end:** `StaffDay.firstSeenAt` / `lastSeenAt`. **Span** = end − start.
- **Active time:** `activeMinutes`. **Active share** = active / span.
- **Work blocks:** consecutive active minutes. Gaps of 15 minutes or more are shown as idle gaps.
- **Time per module:** `ActiveMinute` grouped by module (available for the last 6 months).
- **Actions / views:** counts from `ActivityLog`.

### 7.2 Per role: output and timeliness
Who did something and when it was logged come from the audit trail, because several models do not store them (FollowUp
has no `completedById`; Session `actualDate` can be backdated; ContentItem has no `postedAt`; a manually
recorded Payment has no recorder). So these numbers start at go-live; earlier periods show "not tracked".

| Role | Output | Timeliness |
|---|---|---|
| CRO | Follow-ups completed, leads added, conversions, payments recorded (count, ₹) | Follow-ups completed by their due date (%), median days late |
| Coach | Follow-ups completed, client updates | Same follow-up timeliness |
| Skincare / fitness / styling consultant | Sessions completed, documents uploaded | Session logged the same day (%), median lag between scheduled time and when completion was logged; completed sessions with no upload |
| + Fitness trainer | Weight logs, check-ins reviewed, notes, plan edits | Median check-in review time (check-in created → `fitness.checkin_reviewed`) |
| + Styling consultant | Checklist items done | Items done before the styling date (%) |
| Media | Content created, moved, posted | Posted on or before the deadline (%) |
| Ops head | Assignments, payment approvals, expense approvals | Median approval turnaround |
| Everyone | Tasks completed | Completed by the due date (%) |

## 8. Founder UI

A new nav item **Team Pulse** (`navItems.tsx`, founder only) and a new capability `team.monitor`, which only founders
receive automatically through `founder: [...CAPABILITIES]`. Routes are guarded in `App.tsx` and lazy-loaded so the
code is not in the bundle staff download. All data comes from `GET /api/pulse/*`, which returns 403 for anyone but
a founder. Built in the Atelier design language (`apps/web/DESIGN.md`).

### 8.1 Team Pulse overview: `/team-pulse`
A `Day | Week | Month` switch with a date stepper.

**Day view**
```
┌ Team Pulse ──────────────────────────────── ‹ Thu, 2 Oct › [Day|Week|Month] ┐
│ Working now:  ● Riya (CRO · Payments)  ● Anand (Fitness)  ◐ Sana (idle 9m)    │
├───────────────────────────────────────────────────────────────────────────────┤
│           8      10      12      14      16      18      20                   │
│ Riya      ░░██████░░░░░████░░░░░██████████░                  4h 50m  23 ▸     │
│ Anand        ███████████░░░░██████████                       6h 05m  31 ▸     │
│ Sana              ██░░░░░░░░███                              1h 20m   6 ▸     │
│ Meher     no activity                                                         │
│           █ active   ░ idle within span   · actions shown as ticks above bar │
├───────────────────────────────────────────────────────────────────────────────┤
│ Staff   Role  Start  End    Active  Actions  Key output                       │
│ Riya    CRO   9:41   18:12  4h 50m  23       3 follow-ups · ₹25,000           │
│ ...                                                                           │
└───────────────────────────────────────────────────────────────────────────────┘
```
- **Working now:** pinged within 2 min = active (●); 2 to 15 min = idle (◐); otherwise not shown. Refreshes every 30s.
- **Team timeline:** one lane per staff member; active minutes drawn as bars; changes as ticks. Hover a tick for its sentence; click a lane to open that person's log scrolled to that time.
- **Table:** start, end, active time, actions, and the top 1 to 2 role outputs. Sortable. Click a row to open the person.

**Week / Month view:** a heatmap (staff × days, cell = active hours; empty = no activity) plus a table with days active,
average start, average end, average active hours per day, total actions, role outputs and timeliness for the period.

### 8.2 Staff page: `/team-pulse/staff/:userId`
- **Header:** name, role, status (Active / Deactivated), period selector (This week, Last 30 days, Custom), **Export** button.
- **KPI row:** days active, average start, average end, average active hours per day, the role's output and timeliness numbers (with the previous period for comparison).
- **Time by module:** a horizontal stacked bar for the period.
- **Activity log:** the chronological log (mocked up in the design chat):
  - grouped by day, newest first; each day header shows first and last activity, active time, actions and key outputs, plus a thin day bar of active and idle time;
  - entries as sentences with icon, time and module tag; expand for field changes and timeliness ("due 1 Oct, logged 2 Oct, 1 day late");
  - views are muted and grouped ("Viewed 6 client profiles"); idle gaps of 15 minutes or more are shown as dashed dividers; sign-ins show device;
  - colour by meaning: neutral for presence and views, teal for routine work, amber for corrections, edits and voids, coral for deletions and exports;
  - filters: All, Changes, Views, Sign-ins, and per module; search by client or action; infinite scroll (keyset pagination).

### 8.3 All activity: `/team-pulse/activity`
The same log component across everyone, newest first, with a person filter. Founders' own changes appear here
(it is the audit trail) behind an "Include founders" toggle, off by default.

### 8.4 Client History tab
A **History** tab on `/clients/:id` (`ClientProfilePage.tsx`), visible only to founders: every change and view
concerning that client, by anyone, using the same log component filtered by `clientId`.

## 9. Report export

From the staff page: **Export** → choose the period (defaults to the page's period) and an optional
**Hide client names** checkbox (off by default; names become initials, e.g. "A. N.") → **Download PDF** or **Download CSV**.

- **PDF:** a print-optimised page (`/team-pulse/staff/:userId/report?from&to&hideClients`) styled for A4 with `@media print`, which opens the browser's Save as PDF. This avoids the server PDF stack, which is currently broken for receipts (review finding H1).
- **Contents:**
  1. **Summary:** staff member, role, period, generated date; days active, average start and end, total and average active hours, actions, role outputs and timeliness.
  2. **Day by day:** date, start, end, active time, actions, key outputs.
  3. **Activity:** the full chronological list (oldest first), one line per entry.
- **CSV:** `GET /api/pulse/staff/:userId/report.csv?from&to&hideClients`, one row per activity entry (time, verb, sentence, module, client, changes).
- Each export is recorded in the audit trail as a founder action.

## 10. Access control and security
- Every `/api/pulse/*` route checks `role === founder` server-side. `ActivityLog` read access narrows from founder + ops head to founder only. New tables are denied on the gateway.
- `POST /api/heartbeat` and `POST /api/events` require authentication, record only tracked staff (founders and clients get the same silent 204), take no timestamps from the client, accept only allowlisted event verbs and modules, and are rate-limited per user (heartbeat: 120/hour plus a 5s minimum gap, events: 600/hour).
- Audit rows are append-only: no update or delete path exists in the API, and founders cannot edit them either.
- IP and user agent are stored only for sign-ins (`AuthSession` and the sign-in event).
- Behind nginx, the client IP is the first `X-Forwarded-For` hop (as `lib/scan.ts` already does).
- **Visibility caveat:** the UI shows staff nothing, but the ping and event requests are visible in browser developer tools to anyone who goes looking.

## 11. Retention and performance
- The daily cron (`runDailyJobs`, 01:30 IST) deletes `ActiveMinute` rows older than 6 months. `StaffDay`, `ActivityLog` and `AuthSession` are kept.
- The ping is one tiny insert per active minute; capture adds one read per write (fine at this team size); the audit flush is one `createMany` per request.
- Pulse queries are server-side aggregates (no whole-table fetches into the browser, unlike the current dashboards); the log uses keyset pagination on `(createdAt, id)`.

## 12. Build phases

The capture layers should ship first and together, because **history only exists from the day capture goes live**.

| Phase | Scope | Done when |
|---|---|---|
| **1. Capture** | Spike: ZenStack enhance on an extended client. Request context, change capture, flush, exclusions and redaction, verb rules, sentence catalog, `logActivity` actor fix, `ActivityLog` migration and founder-only policy. | A gateway FollowUp completion, a privileged payment approval and a cron change each produce correct rows (actor, diff, verb, clientId); a failed request leaves none. |
| **2. Presence** | `StaffDay`, `ActiveMinute`, `AuthSession`; `touchPresence`; `useHeartbeat`; sign-in detection; sign-out, client view and CSV export events; document download event; retention job. | Real usage shows correct start, end and active minutes; an idle open tab produces nothing; two tabs never double count; founders and clients are never tracked. |
| **3. Founder UI** | `/api/pulse/*`; Team Pulse overview (Day, Week, Month); staff page and activity log; All activity; client History tab; nav, capability and lazy route. | A founder can answer "what did X do on Thursday" in two clicks; non-founders get 403 everywhere. |
| **4. Export** | Print report and CSV. | The PDF and CSV match the staff page for the same period. |

Phases 1 and 2 can ship as one PR to start collecting data early; 3 and 4 follow.

## 13. Testing
- **Unit:** diff (ignored fields, JSON truncation, empty diffs), verb rules, work-day key at 03:59 and 04:00 IST, sentence catalog.
- **DB / API (e2e stack):**
  - gateway writes by each role produce audit rows with the real actor;
  - ops head, CRO and others get 403 on `/api/pulse/*` and an empty or denied `ActivityLog` read through the gateway;
  - pings without staff auth are rejected; duplicate pings in the same minute insert one row;
  - background-tagged requests do not move `firstSeenAt`;
  - a failed (4xx/5xx) request leaves no audit rows.
- **Playwright:** the founder sees Team Pulse and the staff log; staff see no nav item and get redirected from `/team-pulse`; the export page renders the period.

## 14. Risks and limitations
- **ZenStack 2.x + Prisma 7 extension compatibility.** De-risked by the Phase 1 spike; a gateway-level fallback is defined (§5.2).
- **History starts at go-live.** Before that, Pulse shows only what existing domain fields can reconstruct; timeliness shows "not tracked".
- **Off-platform work is invisible by nature.** A trainer who runs four sessions and logs them in ten minutes shows ten active minutes. The report pairs time with outputs for this reason, and the founders should read it that way.
- **Failed requests.** Entries from a request that returns an error are discarded (logged to the server log). A non-transactional route that commits and then fails would lose its audit rows; the review's atomicity fixes make this rare.
- **Phones.** Pinging works in mobile browsers while the tab is in the foreground; backgrounded tabs stop counting, which is correct.
- **Legal.** Staff are not notified. Monitoring employees' use of company systems is common, but the founders may want to confirm their obligations under India's DPDP Act 2023 (IP addresses and activity data are personal data).

## 15. Files touched (indicative)
- `packages/db/schema.zmodel`: `ActivityLog` changes, new models, migration.
- `packages/db/src/client.ts` (raw + captured clients), `packages/db/src/index.ts`; `packages/db/src/audit/*`: context, capture, diff, client resolution, flush; `packages/db/src/server/presence.ts`.
- `packages/db/src/server/activityLog.ts`: context-aware actor.
- `packages/shared/src/activity.ts` (modules, verb rules, work day; the sentence catalog comes with phase 3); `packages/shared/src/permissions.ts`: `team.monitor`.
- `apps/api/src/lib/{requestContext,presence}.ts`; `handler.ts` (context + flush); `auth.ts` (actor, sign-in detection).
- `apps/api/src/app/api/{heartbeat,events}/route.ts`; `apps/api/src/app/api/pulse/**` (phase 3); `documents/signed-url` (view event); `lib/scan.ts` (`clientIp`); cron (retention).
- `apps/web/src/lib/heartbeat.ts`; `layouts/StaffLayout.tsx`; `lib/insights.ts` (`downloadCsv` event); `auth/AuthProvider.tsx` (sign-out event); `pages/clients/ClientProfilePage.tsx` (view event, History tab); `pages/team-pulse/**`; `layouts/navItems.tsx`; `App.tsx`.

## 16. Implementation notes (phases 1 and 2, 2026-10-04)

Built and verified: 147 DB tests (13 new in `packages/db/tests/team-pulse.test.ts`) and 124 e2e tests (7 new in `apps/e2e/specs/modules/team-pulse.spec.ts`) green; all workspaces typecheck; API production build passes.

**Spike result (the technical risk).** ZenStack 2.22 `enhance()` works over a Prisma 7 client carrying a query extension. ZenStack splits nested writes into separate top-level operations, so each entity is captured individually, and policy-denied writes are never issued at all. It narrows every write to `select: { id: true }` inside its own transaction, so capture widens the select for the same query and strips the extra fields before returning (§5.2).

**Changes from the design, decided during the build:**
- Endpoints are `POST /api/heartbeat` and `POST /api/events` (neutral names).
- Presence counts only activity a person caused (§4.2); there is no background-request header.
- The audit `AsyncLocalStorage` is pinned on `globalThis`. Next evaluates `@gtb/db` more than once (instrumentation and route bundles), and with a module-level store the globally cached Prisma client's capture extension read a different store from the one the request filled: named events were logged but generic gateway writes were silently not. Found by the e2e run.
- View deduplication is in the database under a `pg_advisory_xact_lock`, not process memory (memory resets on module re-evaluation; React StrictMode fires two simultaneous opens).
- `createMany` on uuid-keyed models assigns the ids in the capture layer (what `@default(uuid())` does anyway), so bulk-created rows such as an activation's sessions are recorded under their real ids.
- Capture runs only inside a request/cron context; seeds and scripts are not audited.
- `ActivityLog.entityType` now always holds the Prisma model name; the migration renames the old lowercase rows ("payment" to "Payment").
- `resolveAuthUser` is memoised per request (the gateway resolved the caller twice, i.e. two Supabase round trips).

**Bugs fixed along the way:**
- `sessionCompletion` logged the session's consultant as performer even when a founder or ops head completed it. Named events now take the real actor from the request; a different caller-supplied user is kept as `meta.subjectId`.
- `clientIp` trusted the first `X-Forwarded-For` hop, which the caller controls (nginx appends rather than replaces), so the scan funnel's per-IP rate limit could be bypassed with a rotating fake header. It now uses nginx's `X-Real-IP`, falling back to the last hop.

**Deploy:** the migration (`20261004000000_team_pulse_capture`) is additive and applies through the existing `migrate:deploy` step. Capture starts collecting from the first request after release.

## 17. Implementation notes (phases 3 and 4, 2026-10-04)

Built and verified: 150 DB tests and 128 e2e tests green (the e2e spec now also covers founder-only nav/pages/API, overview to staff log, the founder-only client History tab, and CSV + printable export with the export audited); all workspaces typecheck; API and web production builds pass; checked by hand in the browser against a seeded week of activity.

- **Read side** lives in `packages/db/src/server/pulse.ts` (day overview, period, staff detail, role outputs and timeliness, grouped feed) so the DB suite can test it. Routes: `GET /api/pulse/{day,period,feed,report}`, `GET /api/pulse/staff/:id`, each starting with `requireFounder` (`apps/api/src/lib/pulse.ts`).
- **Sentence catalog** is `describeActivity` in `packages/shared/src/activity.ts`, shared by the UI and the CSV, with work-day helpers (`workDayWindow`, `workDayRange`, `workDayClockMinutes`, formatting).
- **Web**: `apps/web/src/pages/team-pulse/*` (overview with Day/Week/Month, staff page, all activity, printable report), each a lazy chunk; the client History tab lazy-loads the same `ActivityLogView`. Nav item and routes are gated by the founder-only `team.monitor` capability.
- **Actions** are counted as distinct requests (one save that writes three rows is one action). Output counts dedupe an entity per request.
- **Report**: `format=json` feeds the print page (A4 `@media print`, auto-opens the print dialog from the Export button); `format=csv` downloads. `hideClients` is applied server-side so both formats match. Every report fetch is audited as the founder's `report.exported`.
- **Dev convenience**: `.claude/launch.json` gained `api-e2e` and `web-e2e`, which run the app against the isolated e2e stack (public local demo keys only).

**Known limitation (pre-existing):** the staff shell is not responsive; on a phone the sidebar takes the screen on every page, Team Pulse included.

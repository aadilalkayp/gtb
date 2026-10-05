# Sales Daily Reports

**Status:** Approved 2026-10-05 (sales credit rule: option 2, see §6). Phases 1 and 2 built on branch `sales-reports` (§18); phase 3 (Team Pulse link) not built yet.
**Audience:** Aadil (build) and the GTB founders (product).
**Origin:** client request with an AI-generated mockup (2026-10-05). This doc keeps the intent of the mockup and fixes its problems (§12).

---

## 1. Summary

Every CRO submits a short end-of-day report about their sales work. The founder sees all reports on one read-only page:
who has reported, what each person says they did, and how that compares with what GTB OS actually recorded.

Most sales work happens outside the app (WhatsApp, Instagram, calls), and neither GTB OS nor Team Pulse can see it.
The daily report is the CRO's own account of that work. Numbers the system already knows (sales and payments) are
**filled in automatically and cannot be edited**, so the report never contradicts the ledger.

| Part | Who | Source |
|---|---|---|
| Enquiries handled, lead follow-ups, hot leads, follow-ups planned for tomorrow, challenges | CRO | Typed by the CRO |
| Leads added in GTB OS, confirmed sales (count and ₹), payments received (₹) | System | Calculated live from GTB OS |
| Submission status (on time, late, missed, day off) | System | Derived from when the report was submitted |

## 2. Goals and non-goals

**Goals**
- A 2-minute daily form for CROs, reachable from their dashboard.
- A founder page that shows today's state at a glance, plus history by day, week or month, with CSV export.
- "Reported vs recorded" side by side: enquiries the CRO reports next to leads they actually added to GTB OS.
- "Planned vs done": yesterday's "follow-ups planned for tomorrow" next to today's lead follow-ups.

**Non-goals (this version)**
- Reports from any role other than CRO.
- Visibility for anyone except founders. Ops head sees nothing; a CRO sees only their own reports.
- Founders submitting reports (the mockup's "Submit Daily Report" button on the founder view is dropped).
- Lead tracking in GTB OS (lead temperature, lead follow-up records). The report collects counts only. If the founders later want this tracked per lead, it is a separate feature.
- Targets, leaderboards or alerts (see §13 for reminders).

## 3. Decisions

| Topic | Decision |
|---|---|
| Who submits | **CROs only** (`role = cro`, active accounts). Founders never appear in the expected list. |
| Who sees | **Founder only** for the team view. Each CRO sees their own reports and statuses. Enforced server-side. |
| Sales and payments | **Auto-filled from GTB OS, read-only.** Not stored on the report; always calculated live (§6). |
| Sales credit | **The CRO who created the lead.** If the lead has no CRO creator (Readiness Scan leads, leads created before tracking began, leads a founder or ops head created), credit falls back to the client's assigned CRO at the time of the sale (§6). |
| Work day | Same as Team Pulse: **4:00 am IST boundary** (`workDayKey` / `workDayWindow` in `packages/shared/src/activity.ts`). A report written at 1 am counts for the previous day. |
| Deadline | The end of the work day (4:00 am IST the next morning). |
| Editing | The CRO can edit freely until the deadline. After it, the report is locked. Changes are captured by the Team Pulse audit trail. |
| Late reports | Allowed for the **previous work day only**, marked **Late**. Older days stay **Missed**. |
| Days off | The CRO can mark a day as **Day off** (one tap, today or the previous day). Proposed default, see §13. |

## 4. What the CRO reports

Each field has a short helper line on the form so every CRO counts the same way.

| Field | Type | Helper text |
|---|---|---|
| New enquiries handled | 0 to 999 | New people you spoke to today, from any channel (WhatsApp, Instagram, calls, walk-ins). |
| Lead follow-ups done | 0 to 999 | Follow-ups with leads who have not paid yet. Client check-ins are tracked separately in CRO Tracking. |
| Hot leads | 0 to 999 | Leads who are seriously interested and likely to pay soon. |
| Follow-ups planned for tomorrow | 0 to 999 | How many lead follow-ups you plan to do tomorrow. |
| Challenges or support needed | Text, optional, up to 2,000 characters | Anything blocking you, or anything you need from the founders. |

No cross-field validation (hot leads can come from enquiries on earlier days).

**Why "lead follow-ups" is labelled carefully:** the existing `FollowUp` model is for enrolled clients (weekly check-in,
payment reminder, progress update). Lead follow-ups are not tracked anywhere today, so this number is self-reported
and must not be confused with the "Follow-ups completed" figure Team Pulse shows for CROs.

## 5. Status

Derived, never stored:

| Status | Rule |
|---|---|
| **Submitted** | A report exists and `submittedAt` is before the end of its work day. |
| **Late** | A report exists and `submittedAt` is after the end of its work day. |
| **Day off** | The CRO marked the day as a day off. |
| **Pending** | Today, no report yet. |
| **Missed** | A past day, no report, no day off, and the CRO's account existed and was active that day. |

A CRO created mid-period is not "Missed" for days before their account existed (`User.createdAt`). A deactivated
CRO keeps their past reports but is no longer expected.

## 6. Auto-filled figures

Calculated live for a CRO and a work day window `[start, end)`. Live means that if a payment is later edited or
voided (`paymentCorrection.ts`), the report updates to match the ledger.

| Figure | Definition |
|---|---|
| **Leads added in GTB OS** | Clients with `createdById = CRO` and `createdAt` inside the window. |
| **Confirmed sales** | Clients with `conversionDate` inside the window, credited to the sales CRO (below). Shows count, plus total `agreedPrice`. A sale whose price is not recorded yet shows as "price pending" and is excluded from the ₹ total. |
| **Payments received** | `Payment` with `kind = payment` and `status = approved` and `approvedAt` inside the window, credited to the sales CRO. Waivers and voided payments are excluded (same as the cash metrics elsewhere). |

**Who gets the credit (the sales CRO).** Before this feature, nothing recorded who created a lead: `Client` had no
creator field, and `Client.convertedById` is whoever approved the first payment (often the ops head or a founder).
The CRO assignment is made by whoever sends the invite, which is not always the person who found the lead.
So the rule is:

1. **The lead's creator**, `Client.createdById` (new, §7), if that user is a CRO.
2. Otherwise, **the client's assigned CRO at the time of the event**: the `Assignment` with `role = cro` for that
   client where `assignedAt <= eventTime` and (`unassignedAt` is null or `unassignedAt > eventTime`). This covers
   Readiness Scan leads (created by the system), leads created before creator tracking began, and leads a founder
   or ops head created.
3. If neither exists, the event is credited to nobody and appears in the founder's team total as "Unassigned".

The credit is the same for a client's sale and all of its later payments, so a lead found by CRO A and invited by
CRO B counts for A. Reassigning the CRO later does not move credit for leads that have a CRO creator.

**Difference from Team Pulse.** Team Pulse counts what a person *did* in the app ("payments recorded" by actor).
Sales Reports counts what a CRO's *clients* did ("payments received", by ownership). The two numbers can differ, and
that is intended. The founder UI labels them distinctly.

## 7. Data model

One new model. Denied on the ZenStack gateway, written and read only by the routes in §8 using the base client.

```zmodel
/// A CRO's end-of-day sales report (SALES_REPORTS_DESIGN.md). One per CRO per
/// IST work day (4 am boundary). Server-written; never exposed on the gateway.
model SalesReport {
  id                String   @id @default(uuid())
  croId             String
  cro               User     @relation("SalesReports", fields: [croId], references: [id])
  day               DateTime @db.Date

  dayOff            Boolean  @default(false)
  enquiries         Int?     // all four counts are null on a day off
  leadFollowUps     Int?
  hotLeads          Int?
  plannedFollowUps  Int?     // "follow-ups planned for tomorrow"
  challenges        String?

  submittedAt       DateTime // first submission; drives on time vs late
  editedAt          DateTime? // last change before the deadline

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([croId, day])
  @@index([day])
  @@deny('all', true)
}
```

And one new field on `Client`, the lead's creator:

```zmodel
model Client {
  // ...
  // Who created the lead (sales credit, SALES_REPORTS_DESIGN.md §6). Set to the
  // caller on gateway creates; null for system-created leads (Readiness Scan).
  createdById String? @deny('update', true)
  createdBy   User?   @relation("ClientCreator", fields: [createdById], references: [id])
  // ...
  @@deny('create', createdById != auth().id)  // gateway callers cannot credit someone else
}
```

The lead form sends the caller's id, and the create policy rejects anything else (including a blank value), so
every gateway-created lead has its real creator. `@default(auth().id)` would be neater but crashes ZenStack 2.22's
generator under Prisma 7. The base client (Readiness Scan claim) bypasses the policy and leaves it null.

**Backfill:** the migration sets `createdById` from the Team Pulse audit trail (`ActivityLog` with
`verb = client.created`) for leads created since Team Pulse went live (2026-10-04). Older leads stay null and use
the assigned-CRO fallback.

Auto-filled figures are not stored (§6). Migration is additive.

## 8. API

All routes under `apps/api/src/app/api/sales-reports/`, base Prisma client, `no-store`.

| Route | Who | Purpose |
|---|---|---|
| `GET /api/sales-reports/mine?from&to` | CRO | Own reports with statuses and auto figures; also "yesterday's plan" for the form. |
| `PUT /api/sales-reports/mine` | CRO | Create or update the report for `day` (today or the previous work day). Body: the §4 fields, or `{ dayOff: true }`. Rejects locked days, other days and out-of-range values. |
| `GET /api/sales-reports/day?day` | Founder | Team view for one work day: one row per expected CRO with status, reported fields, auto figures; team totals. |
| `GET /api/sales-reports/period?from&to` | Founder | Per-CRO totals and on-time rate for the range; daily series for the trend; challenges feed. |
| `GET /api/sales-reports/export?from&to` | Founder | CSV, one row per CRO per day. Audited as `report.exported` like Team Pulse exports. |

Guards: founder routes use `requireFounder` (`apps/api/src/lib/pulse.ts`, move it to a shared helper). CRO routes
require `role = cro` and active; the CRO is always taken from the session, never from the body. Founders and other
roles get 403 on `PUT`.

The read side lives in `packages/db/src/server/salesReports.ts` so the DB suite can test it, mirroring `pulse.ts`.

## 9. CRO UI

- **Dashboard card** on the CRO dashboard (`DashboardPage.tsx`, `case "cro"`):
  - not submitted: "Today's report is not in yet" + button;
  - submitted: "Submitted at 7:42 pm. You can edit until 4:00 am.";
  - yesterday missing: "Yesterday's report is missing. Submit it now (marked late)."
- **Page `/daily-report`** (nav item "Daily Report", capability `salesreport.submit`, CRO only):
  - Form with the §4 fields. Above it, yesterday's plan ("You planned 6 follow-ups for today").
  - A read-only panel "From GTB OS today": leads added, confirmed sales (count, ₹), payments received (₹).
  - "Mark as day off" link.
  - Below, the CRO's own history: date, status, their numbers, auto figures. Read-only after the deadline.

## 10. Founder UI

**Page `/sales-reports`** (nav item "Sales Reports", capability `salesreport.view_all`, founder only, lazy route).
Read-only. Built in the Atelier design language (`apps/web/DESIGN.md`). Copy follows the no-em-dash rule.

- **Header:** Day / Week / Month switch and a date picker. Default: today (before 4 am, the previous work day).
- **KPI row (day view):**
  - Reports in: 3 / 4, with a bar.
  - Enquiries reported, with "leads added in GTB OS" underneath.
  - Lead follow-ups done, with "planned yesterday" underneath.
  - Confirmed sales: count and ₹ value.
  - Payments received: ₹.
- **Team table:** one row per expected CRO: name, status chip, enquiries (reported) / leads added (recorded),
  follow-ups done / planned, hot leads, sales, ₹ received, and an icon if challenges were written. Clicking a row
  opens the full report in a side panel.
- **Challenges:** a list of everything written under "Challenges or support needed" for the selected period, newest first.
  This is the part most likely to need the founder's action, so it is not buried inside individual reports.
- **Week / Month view:** per-CRO totals, reports on time (%), late and missed counts, and a small daily trend of
  enquiries vs leads added. CSV export.
- **Team Pulse link:** on a CRO's Team Pulse staff page, each day header shows a one-line summary of that day's report
  with a link to it (phase 3).

The mockup's separate "Recent Reports" table is dropped: it repeated the day view. History is the Week / Month view.

## 11. Access control

- `SalesReport` is denied on the gateway. Every route checks role server-side.
- Founder routes: founder only. Ops head, CROs and everyone else get 403.
- CRO routes: own reports only; `croId` comes from the session.
- New capabilities in `packages/shared/src/permissions.ts`: `salesreport.submit` (CRO) and `salesreport.view_all`
  (founders get it automatically through `founder: [...CAPABILITIES]`). Founders do **not** get `salesreport.submit`;
  it is excluded explicitly so the form never shows for them.
- Writes go through the Team Pulse capture layer, so every create and edit is in the audit trail with the real actor.

## 12. Changes from the client's mockup

| Mockup | This design | Why |
|---|---|---|
| Founder sees "Submit Daily Report" and the checklist form | Founder view is read-only; the form is on the CRO's own page | Founders don't report |
| The logged-in founder (Ishak K) appears as a salesperson with "Pending" | Expected list is active CROs only | Founders are not CROs |
| "Confirmed sales" and "Payments received (₹)" typed in | Auto-filled, read-only | The system already knows; typed numbers drift from the ledger |
| "Follow-ups completed" | "Lead follow-ups done", with helper text | Avoids confusion with client check-ins in CRO Tracking |
| "Pending" with no cutoff | Submitted / Late / Missed / Day off / Pending, 4 am IST deadline | Status needs a deadline to mean anything |
| "Recent Reports" table | Week / Month view + Challenges list | The table repeated the day view |
| No reported vs recorded comparison | Enquiries next to leads added; planned next to done | Gives the founder a reason to trust (or question) the numbers |

## 13. Open questions (defaults proposed)

1. **Reminders.** Proposed default: no notifications. The CRO dashboard card is the nudge, and the founder sees
   Missed. An evening reminder needs a second scheduled job (today only `/api/cron/daily` at 01:30 IST runs), which
   is a small addition if wanted.
2. **Days off and weekends.** Proposed default: every day is expected, and the CRO marks days off themselves. The
   alternative is a fixed weekly off day per CRO in Settings.
3. **Late window.** Proposed default: the previous work day only. Confirm with the founders.

## 14. Build phases

| Phase | Scope | Done when |
|---|---|---|
| **1. Data + CRO side** | `SalesReport` model and migration, capabilities, `salesReports.ts` (status + auto figures), `GET/PUT /mine`, `/daily-report` page, dashboard card. | A CRO can submit, edit before 4 am, submit yesterday's late, mark a day off; locked days reject edits. |
| **2. Founder view** | `/day`, `/period`, `/export`; `/sales-reports` page (Day / Week / Month, team table, side panel, challenges, CSV); nav and lazy route. | The founder can see who reported today and open any report in two clicks; everyone else gets 403. |
| **3. Team Pulse link** | Report summary on the Team Pulse staff page day headers. | Each CRO day in Pulse shows the report status and links to it. |

Phases 1 and 2 can ship as one PR.

## 15. Testing

- **Unit:** status rules at the 03:59 / 04:00 IST boundary; late vs on time; Missed not applied before `User.createdAt`.
- **DB (`packages/db/tests/sales-reports.test.ts`):**
  - a gateway lead create stamps `createdById` with the caller; a caller cannot set someone else; the field cannot be updated;
  - sales and payments credited to the CRO who created the lead, not the inviter or approver;
  - scan leads and founder-created leads fall back to the CRO assignment at event time; reassignment mid-period credits each CRO correctly;
  - waivers, voided and pending payments excluded; an edited payment amount shows up in the report;
  - unassigned conversions appear only in the team total;
  - one report per CRO per day (unique constraint, concurrent `PUT`s).
- **API / e2e (`apps/e2e/specs/modules/sales-reports.spec.ts`):**
  - CRO submits, edits, sees own history; cannot read another CRO's report; `PUT` for a locked day or a two-day-old day fails;
  - founder sees the team view and exports CSV; founder `PUT` gets 403;
  - ops head, coach, media get 403 on every route and see neither nav item.

## 16. Risks and limitations

- **Self-reported numbers can be inflated.** The reported vs recorded comparison makes large gaps visible, but it
  cannot prove an enquiry happened. The founders should read the enquiry and follow-up numbers as the CRO's account.
- **Leads not entered in GTB OS.** If CROs keep leads only on WhatsApp, "leads added" stays low and confirmed sales
  still count (conversion happens in GTB OS). This report may encourage entering leads earlier, which is good.
- **Lead creators before 2026-10-04 are unknown.** Those leads use the assigned-CRO fallback, which is usually the
  same person (the CRO who created a lead normally invites it).
- **History starts at go-live.** No backfill: earlier days show "not tracked", not Missed.
- **Phones.** CROs are likely to fill this in on a phone, but the staff shell is not responsive (pre-existing,
  noted in Team Pulse). The `/daily-report` page should at least work at phone width on its own, even if the sidebar does not.

## 17. Files touched (indicative)

- `packages/db/schema.zmodel`: `SalesReport`, `Client.createdById`, `User` relations, migration (with backfill).
- `packages/db/src/server/salesReports.ts` (+ export from `server/index.ts`); `packages/db/tests/sales-reports.test.ts`.
- `packages/shared/src/permissions.ts`: `salesreport.submit`, `salesreport.view_all`.
- `apps/api/src/app/api/sales-reports/**`; shared `requireFounder` / role guard helper.
- `apps/web/src/pages/sales-reports/**` (founder), `apps/web/src/pages/daily-report/**` (CRO);
  `pages/dashboard/DashboardPage.tsx` (CRO card); `layouts/navItems.tsx`; `App.tsx`.
- `apps/web/src/pages/team-pulse/*` (phase 3).
- `apps/e2e/specs/modules/sales-reports.spec.ts`.

## 18. Implementation notes (phases 1 and 2, 2026-10-05)

Built and verified: 12 new DB tests (`packages/db/tests/sales-reports.test.ts`, 162 in the suite) and 6 new e2e tests
(`apps/e2e/specs/modules/sales-reports.spec.ts`) green; all workspaces typecheck; web and API production builds pass;
checked by hand in the browser as a CRO and as the founder.

- **Server:** `packages/db/src/server/salesReports.ts`. `salesReportGrid` is the core (every CRO x every day: status,
  report, live figures, planned-yesterday); `salesReportDay` and `salesReportPeriod` build the founder views from it.
  `salesCreditFor` is the §6 rule. `saveSalesReport` enforces the write window.
- **Routes:** `/api/sales-reports/{mine,day,period,export}`. Founder routes reuse `requireFounder`, `parseDay` and
  `parseRange` from `apps/api/src/lib/pulse.ts`; `requireCro` lives in `apps/api/src/lib/salesReports.ts`.
- **Shared:** field labels, help text and limits in `packages/shared/src/salesReports.ts`; capabilities
  `salesreport.submit` (CRO) and `salesreport.view_all` (founder; founders are explicitly not given `submit`).
- **Web:** `apps/web/src/pages/sales-reports/` (`DailyReportPage`, `SalesReportsPage`, `DailyReportCard` on the CRO
  dashboard). Both pages are lazy routes behind `RequireCapability`.
- **Audit:** report writes appear in Team Pulse as `salesreport.submitted`, `salesreport.edited` and
  `salesreport.day_off` (module CRO); the CSV export is audited as `report.exported`.
- **Migration** `20261005000000_sales_reports` is additive and backfills `Client.createdById` from the audit trail.

**CRO dashboard:** the "Conversions this month" tile used to count `convertedById` (the approver). It now reads
`monthToDate` from `GET /api/sales-reports/mine`, so it uses the same credit rule as the reports.

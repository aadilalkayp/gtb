# GTB OS — End-to-End Testing Guide

A story-driven walkthrough that exercises every feature, framed around **who does
what and why**. Work top to bottom and tick the boxes as you go.
Spec: [`gtb_os_srs_v2.md`](./gtb_os_srs_v2.md).

---

## 0. Setup & gotchas (do these once)

- [ ] `pnpm dev` running → web on **http://localhost:5173**, API on **http://localhost:3001**.
- [ ] Local Supabase running (`supabase start`).
- [ ] **Invite links must redirect to the app.** In `supabase/config.toml`:
  ```toml
  [auth]
  site_url = "http://localhost:5173"
  additional_redirect_urls = ["http://localhost:5173", "http://localhost:5173/portal/register"]
  ```
  then `supabase stop && supabase start`. Without this, invite links land on
  `127.0.0.1:3000` (Supabase's default) and look broken.
  - _Stuck with an existing link?_ Rewrite its host/path to
    `http://localhost:5173/portal/register#<the-whole-#hash>` and open it (valid ~1h).
- [ ] Founder can log in: a Supabase auth user with the seeded founder email
  (`aadil.alkp@gmail.com`) + password; first login links by email.

**Multi-user trick:** every invite returns a **copyable registration link** (no
email needed). Open it in an **Incognito window** to act as that person. Keep
Founder in your main window; sign out/in in one Incognito window to switch roles.

---

## The org model — separation of duties

GTB OS is built around three lanes. Work flows left to right, and each handoff is
owned by a different role, so no single person is a bottleneck (and no one role
can do everything).

```
   SALES                OPERATIONS               DELIVERY
   ─────                ──────────               ────────
   CRO            →     Ops Head           →     Consultants (skincare/fitness/styling)
   (lead→convert)       (assign + activate)      Coach (relationship/retention)
                                                  Media (content)
                        Founder = oversight across all three
```

### Roles & responsibilities

| Role | Lane | Owns | Key screens |
|---|---|---|---|
| **Founder** | all | Oversight, financials, team & plans, anything blocked | everything |
| **Operations Head** (`ops_head`) | operations | **Assigning teams + activating clients**, monitoring unassigned/at-risk, approving payments & expenses | Assignments, Payments, Reports, Expenses |
| **CRO** (`cro`) | sales | The **pipeline**: create lead → invite → approve first payment (convert) → ongoing **follow-ups** & payment reminders | Clients, Payments, CRO Tracking |
| **Coach** (`coach`) | delivery | The client's **relationship**: overall progress, **escalations / at-risk**, check-ins, tasks | Clients, CRO Tracking, Team Tasks |
| **Consultants** (`skincare_consultant`, `fitness_trainer`, `styling_consultant`) | delivery | Running their service's **sessions**: complete, take notes, **upload the plan/guide**. Earn per-session payouts | Consultations, Styling Operations |
| **Media** (`media`) | delivery | The **content pipeline** (plan → shoot → edit → review → post) across campaigns | Media |
| **Client** (groom/bride) | — | Self-service: onboard, view schedule, upload payment proofs, **rate sessions**, view docs | `/portal/*` |

### Lifecycle ownership — who moves the client forward

| Stage / transition | Status change | Owner |
|---|---|---|
| Create lead | → **Lead** | CRO · Ops · Founder |
| Invite to portal | lead phase advances | CRO · Ops |
| Onboard (assessment → plan → proof) | → `payment_submitted` | **Client** (self-service) |
| Approve first payment | Lead → **Converted** | CRO · Ops · Founder |
| Assign team + **activate** (generates sessions) | Converted → **Active** | **Ops · Founder** (not CRO) |
| Deliver sessions | — | Consultants |
| Follow-ups / retention | — | CRO + Coach |
| Hold / Cancel / Complete | status change | Ops · Founder |

> **Why the CRO can't activate:** assignment + activation is an _operations_
> responsibility. The CRO hands a converted client to the **Ops Head**, who builds
> the team and starts the schedule. Either the Ops Head **or** the Founder can do
> it — so the Founder is never a single point of failure.

---

## The cast (create these in Act 1)

| Persona | Role | Their job in this story |
|---|---|---|
| Founder (you) | `founder` | oversight; unblock anything |
| Olivia Ops | `ops_head` | assigns Aarav's team and activates him |
| Carl CRO | `cro` | creates/ invites Aarav, approves his payment, runs follow-ups |
| Coach Kim | `coach` | watches Aarav's progress + at-risk |
| Sara Skin | `skincare_consultant` | runs skincare sessions, uploads the skincare plan |
| Femi Fit | `fitness_trainer` | runs fitness sessions |
| Stella Style | `styling_consultant` | runs styling ops + delivers the styling guide |
| Mia Media | `media` | runs the content pipeline |
| Aarav Mehta | client (groom) | the client everyone is serving |

**Where things appear (quick reference):**

| Thing | Best place to verify |
|---|---|
| A client's sessions | `/clients/:id` → **Sessions** tab (no filter) |
| All sessions | `/consultations` → switch pill to **All** |
| Client's own view | `/portal/*` (as the client) |
| Money in/out | `/payments`, `/expenses` |
| Live KPIs | `/dashboard`, `/reports`, `/alerts` |

---

## Act 1 — Build your team _(as Founder)_

**Context:** Only the Founder manages user accounts (`user.manage`). Staff don't
self-register — the Founder invites each one, which provisions their `User` row and
a set-password link. You're populating all three lanes so the rest of the story has
real people to hand work to.

**Settings → Team & Users → Invite.** Create one of each role in the cast. For each:
copy the registration link → Incognito → set password (lands on `/dashboard`).

- [ ] Invited Ops, CRO, Coach, Skincare, Fitness, Styling, Media
- [ ] Each set their password and can log in
- [ ] **Set per-session rates** for Sara/Femi/Stella (edit staff → rate). _This is what auto-creates payout expenses when they complete a session in Act 6._
- [ ] ✅ Each role's `/dashboard` is different — proof the role-aware views work

> The GTB groom plan uses **all three** services, so you need skincare **+** fitness
> **+** styling consultants to fully staff Aarav in Act 5.

## Act 2 — Create & invite a client _(as Carl CRO)_

**Context:** This is the **top of the sales funnel** and the CRO's core job. Creating
a lead captures the prospect; inviting them sends a portal link and auto-assigns the
inviting CRO as the client's relationship owner. (Ops or Founder can also do this,
but it's the CRO's lane.)

- [ ] **Clients → New** → Aarav Mehta, type **Groom**, wedding ~3 months out, city, phone, email, lead source → saves as **Lead**
- [ ] Open his profile → **Invite** → copy his registration link
- [ ] ✅ Status **Lead**; Carl is now Aarav's **CRO** (auto-assigned)

## Act 3 — Aarav onboards _(Incognito, as the client)_

**Context:** Onboarding is **client self-service** — the one part of the lifecycle the
staff don't drive. Aarav sets a password, tells us about himself (assessment),
chooses what he's buying (plan → which builds his installment schedule), and proves
he paid (upload). This is the bridge from "interested" to "ready to convert."

Open his link → set password → onboarding wizard:

- [ ] **Assessment** filled (skin / fitness / styling answers)
- [ ] **Plan** picked (GTB groom) → enrolls + builds the installment schedule
- [ ] **Payment proof** uploaded for installment #1
- [ ] ✅ Reaches `/portal`; lead phase = `payment_submitted`

## Act 4 — Convert him _(as Carl CRO)_

**Context:** The CRO closes the sale by **verifying the payment proof**. The first
approval is the magic moment: it flips the client **Lead → Converted** and stamps the
conversion (who/when), which later feeds the sales reports and the CRO's performance
numbers.

- [ ] **Payments** → Aarav's proof → **Approve** (pick method)
- [ ] ✅ Status flips **Lead → Converted**; a notification fires; conversion recorded

## Act 5 — Assign team & activate _(as Olivia Ops)_

**Context:** Conversion hands the client from **sales to operations**. The Ops Head
builds Aarav's delivery team and **activates** him — which generates his entire
session schedule from the plan rules + wedding date and seeds the CRO's follow-ups.
**This is where sessions come from.** (Founder can also do this; the CRO cannot —
it's the operations lane.) Activation is gated until at least one **consultant** is
assigned and saved, so a half-staffed client can't go live by accident.

- [ ] **/assignments** → Aarav → choose **Coach + Skincare + Fitness + Styling** consultants
- [ ] **Save team**
- [ ] **Activate & schedule** (unlocks after save) → _"Activated — 20 sessions scheduled."_
- [ ] ✅ Status **Converted → Active**; sessions appear in `/clients/:id` → Sessions; follow-ups seeded

> If a dropdown says "No … available," that role wasn't created in Act 1 — invite
> them first. If **Activate** stays disabled, you haven't **Saved** a consultant yet.

## Act 6 — Deliver the sessions _(as Sara Skin / Femi Fit)_

**Context:** Now the **delivery lane** does its work. Each consultant only sees their
own service's sessions. Completing a session records that the work happened, lets
them attach the **plan/guide** the client receives, and — because you set a rate in
Act 1 — automatically books their **payout** as a pending expense. This is the
day-to-day heartbeat of an active client.

- [ ] **/consultations** → your service → open a session → **Complete** (date, notes, optional plan PDF)
- [ ] ✅ Session = Completed; a **pending payout Expense** auto-appears in `/expenses`; Aarav is notified
- [ ] Try **Reschedule** (→ delayed) and the **calendar** view toggle

## Act 7 — The client experience _(Incognito, as Aarav)_

**Context:** The client's portal is the trust layer — Aarav sees his countdown,
schedule, payments, and documents, and **rates** each session. Those ratings feed
satisfaction scores and the **at-risk** detection the Coach/Ops rely on, so the
client's voice loops directly back into operations.

- [ ] `/portal/sessions` → **rate** a completed session (stars + feedback)
- [ ] `/portal/payments` → upload the next installment's proof
- [ ] `/portal/documents` → open the plan Sara uploaded
- [ ] `/portal/profile` → edit details / change password

## Act 8 — Follow-ups & retention _(as Carl CRO)_

**Context:** Retention is shared by **CRO and Coach**. Follow-ups (seeded at
activation) keep someone accountable for touching the client on a cadence;
completing one auto-schedules the next. The "not contacted in 7+ days" banner is the
safety net that surfaces clients who've gone quiet.

- [ ] **/cro-tracking** → **Complete** a due follow-up (recurring auto-schedules the next)
- [ ] Try **Snooze** and **New follow-up**; note the "not contacted 7+ days" banner

## Act 9 — Styling operation _(as Stella Style)_

**Context:** Styling is a mini-project on top of the styling sessions — outfits,
accessories, travel, and a delivery checklist culminating in the styling guide. The
styling consultant drives it through its stages so nothing falls through before the
big day.

- [ ] **/styling-operations** → New operation for Aarav (date, location, travel)
- [ ] Tick the checklist → status auto-advances upcoming → in_progress → completed

## Act 10 — Money out _(consultant submits, Ops/Founder approve)_

**Context:** **Anyone** on staff can submit an expense; only **Ops/Founder** approve
(`expense.approve`). This is the spend side of the P&L and the path consultant
payouts take from "earned" to "paid." Approvals are what make the dashboard's
financials and the expense reports real.

- [ ] As Sara: **/expenses → Submit** an expense (optionally attach a client → enables a receipt upload)
- [ ] As Olivia Ops / Founder: **Approve** Sara's expense + the auto payout; **Reject** another with a reason
- [ ] ✅ StatCards (approved / pending / payouts) update

## Act 11 — Tasks, Media, Documents

**Context:** The connective tissue. **Tasks** let any staffer hand work to a teammate
(kanban). **Media** is its own delivery lane — Mia moves content through production
stages. **Documents** is the searchable library of everything uploaded across the
system.

- [ ] **/team-tasks** — create + assign a task; **drag** across columns; set priority/due
- [ ] **/media** (as Mia/Founder) — new content; **drag** Planned → … → Posted; filter by campaign/platform/owner
- [ ] **/documents** — search, filter by type, open (signed URL), upload

## Act 12 — The payoff: dashboards, reports, alerts _(as Founder)_

**Context:** Everything above rolls up here. The Founder (and Ops) get the bird's-eye
view — KPIs, revenue vs collections, the pipeline, today's agenda, at-risk clients,
and the §18.3 alert center — all **derived live** from the data you just created.

- [ ] **/dashboard** — revenue chart, pipeline, agenda, weddings, recent activity, at-risk all populated
- [ ] **/reports** — click all 6 tabs, change the **period**, hit **CSV**
- [ ] **/alerts** — §18.3 center; rows link to records
- [ ] **🔔 bell** — notifications accumulated across the flow

## Bonus — force edge states via Prisma Studio (`pnpm db:studio`)

**Context:** Overdue/at-risk/alerts are computed at render, so you can fake the inputs
and watch them light up on the next refresh — no waiting for real time to pass.

- [ ] Backdate an `Installment.dueDate` (status `pending`) → **Overdue** alerts
- [ ] Clear Aarav's recent completed-session dates → **No activity 7+ days** + at-risk
- [ ] Set a `StylingOperation.stylingDate` to tomorrow → **Styling Tomorrow** alert

---

## Progress log

| Act | Status | Notes |
|---|---|---|
| 0 — Setup | ☐ | Supabase `site_url` fix applied? |
| 1 — Team | ☐ | need skincare + fitness + styling consultants |
| 2 — Lead | ✅ | Aarav created |
| 3 — Onboard | ✅ | enrolled in GTB plan + proof |
| 4 — Convert | ✅ | status = converted |
| 5 — Assign & activate | ⏳ | do it **as Olivia Ops** (or Founder): assign consultants → Save → Activate |
| 6 — Sessions | ☐ | |
| 7 — Client portal | ☐ | |
| 8 — Follow-ups | ☐ | |
| 9 — Styling | ☐ | |
| 10 — Expenses | ☐ | |
| 11 — Tasks/Media/Docs | ☐ | |
| 12 — Dashboards/Reports/Alerts | ☐ | |

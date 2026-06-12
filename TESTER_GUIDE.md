# GTB OS — Tester Guide

A step-by-step walkthrough of every feature in the platform. Follow it top to
bottom, ticking boxes as you go. By the end you'll have exercised the full
client lifecycle from lead creation to dashboards.

---

## What is GTB OS?

GTB OS ("Groom To Be / Glow To Be Operating System") is a web app for managing
clients enrolled in wedding-prep transformation programs — skincare, fitness,
and styling services bundled into plans.

Think of it like a CRM built specifically for a wedding transformation business.
A client (a groom or bride) signs up, picks a package of services, pays, and
then receives a schedule of skincare, fitness, and styling sessions leading up
to their wedding. Staff on the business side manage the entire pipeline — from
first contact to final session.

There are **two portals** sharing one backend:

| Portal | Who uses it | How to access |
|--------|-------------|---------------|
| **Staff portal** | Founder, Ops Head, CRO, Coach, Consultants, Media | Go to the app URL → log in with a staff account |
| **Client portal** | Grooms / Brides (the clients) | Open the registration link provided during invite → set password → lands on `/portal` |

You'll be given:
- The **app URL** (e.g., `https://gtb-os.example.com`)
- **Founder login credentials** (email + password)

All other accounts (staff + client) will be created by you during testing.

### The big picture: how a client moves through the system

```
CRO creates lead  →  Client onboards (self-service)  →  CRO approves payment  →  Ops assigns team & activates  →  Consultants deliver sessions  →  Completed
       ↓                        ↓                              ↓                           ↓                                ↓
   Status: Lead            Still "Lead"               Status: Converted              Status: Active               Sessions marked done
   (lead phase:            (lead phase goes            (conversion recorded)          (schedule generated)          (payouts auto-created)
    new → invited)          through assessment
                            → plan → payment)
```

### Client statuses explained

| Status | What it means | How it's reached |
|--------|---------------|------------------|
| **Lead** | A prospect in the funnel. Not paying yet. | CRO creates the entry |
| **Converted** | First payment approved. Sales closed the deal. | CRO/Ops/Founder approves the first payment proof |
| **Active** | Team assigned, sessions scheduled, services running. | Ops Head or Founder assigns consultants and clicks "Activate" |
| **Completed** | Wedding done, all services delivered. | Manual status change |
| **On Hold** | Client paused services temporarily. | Manual status change |
| **Cancelled** | Terminated before completion. | Manual status change |

A lead also has internal **sub-phases** (visible in the UI but the main status stays "Lead"):
New → Contacted → Invited → Registered → Plan Selected → Payment Submitted

---

## Roles and what each person can do

The platform enforces role-based access — each role sees different sidebar menu
items and can perform different actions. Here's the full breakdown:

| Role | What they do | Sidebar items they see |
|------|-------------|----------------------|
| **Founder** | Full access. Manages users, plans, settings. Sees all dashboards and reports. | Everything: Dashboard, Clients, Assignments, Consultations, Styling Operations, Payments, CRO Tracking, Team Tasks, Media, Documents, Reports, Expenses, Alerts, Settings |
| **Operations Head** | Assigns teams to clients, activates them, approves expenses/payments. Day-to-day operations manager. | Dashboard, Clients, Assignments, Consultations, Styling Operations, Payments, CRO Tracking, Team Tasks, Documents, Reports, Expenses, Alerts |
| **CRO** | Sales person — creates leads, invites clients, approves payments, does follow-ups. | Dashboard, Clients, Consultations, Payments, CRO Tracking, Team Tasks, Documents, Expenses |
| **Coach** | Relationship manager — monitors client progress, handles escalations, does follow-ups. | Dashboard, Clients, Consultations, CRO Tracking, Team Tasks, Documents, Expenses |
| **Skincare Consultant** | Runs skincare sessions, uploads plans/notes. | Dashboard, Consultations, Styling Operations, Team Tasks, Documents, Expenses |
| **Fitness Trainer** | Runs fitness sessions, uploads plans/notes. | Dashboard, Consultations, Styling Operations, Team Tasks, Documents, Expenses |
| **Styling Consultant** | Runs styling sessions, manages styling operations, uploads guides. | Dashboard, Consultations, Styling Operations, Team Tasks, Documents, Expenses |
| **Media** | Manages content pipeline (plan → shoot → edit → review → post). No client data access. | Dashboard, Team Tasks, Media, Expenses |
| **Client** (groom/bride) | Self-service: onboard, view schedule, upload payments, rate sessions. | Portal: Home, Sessions, Payments, Documents, Profile |

### Key permission rules to test

- Only the **Founder** can invite/manage staff (Settings → Users).
- Only **Ops Head + Founder** can assign teams and activate clients. The CRO **cannot** activate — this is intentional.
- Only **consultants** can mark sessions as completed.
- Only **clients** can rate sessions and upload payment proofs.
- **CRO + Coach** can conduct follow-ups.
- **Ops Head + Founder** can approve expenses.
- **Everyone** on staff can submit expenses and use Team Tasks.

---

## Before you start

### Credentials you'll receive

| What | From whom |
|------|-----------|
| App URL | The project owner (will share with you) |
| Founder email + password | The project owner (will share with you) |

### How to test as multiple users at once

This platform has many roles, and you'll need to be logged in as different
people at different points. Here's how:

1. **Main browser window** — keep the Founder logged in here.
2. **Incognito / Private windows** — use these for other users.

Every time you invite someone (staff or client), the system gives you a
**registration link** you can copy — no real email needed. Open that link in an
Incognito window → set a password → that user is now logged in.

You can use separate Incognito windows for different users, or sign out and back
in within one Incognito window to switch between roles.

### Files you'll need for uploads

Several steps require uploading files (payment proofs, documents, etc.). Have a
few dummy files ready:
- 1-2 images (PNG/JPG) — for payment proof uploads
- 1 PDF — for session plan/document uploads

Any files work. They're just stored as proofs/attachments, the content doesn't matter.

---

## The test cast

You'll create these characters during testing. Each represents a role in the
system. Use whatever email addresses you like (they don't need to be real).

| Character | Role | What they do in this test |
|-----------|------|--------------------------|
| **You (Founder)** | Founder | Create the team, oversight, unblock anything |
| **Olivia Ops** | Operations Head | Assigns Aarav's team, activates him |
| **Carl CRO** | CRO | Creates Aarav as a lead, invites him, approves payment, does follow-ups |
| **Coach Kim** | Coach | Monitors Aarav's progress |
| **Sara Skin** | Skincare Consultant | Runs skincare sessions, uploads skincare plan |
| **Femi Fit** | Fitness Trainer | Runs fitness sessions |
| **Stella Style** | Styling Consultant | Runs styling sessions, manages styling operations |
| **Mia Media** | Media | Manages content pipeline |
| **Aarav Mehta** | Client (groom) | The client everyone is serving |

---

## Quick reference: where to find things

| What you're looking for | Where to find it |
|--------------------------|-----------------|
| A specific client's sessions | Clients → click the client → **Sessions** tab |
| All sessions across all clients | **Consultations** page → switch the pill/tab to **All** |
| The client's own view of their schedule | Log in as the client → **Sessions** in the portal nav |
| All payments (incoming money) | **Payments** page |
| All expenses (outgoing money) | **Expenses** page |
| Live KPIs and charts | **Dashboard** page |
| Detailed reports with CSV export | **Reports** page |
| System alerts (overdue, at-risk, etc.) | **Alerts** page |
| Team management (invite/edit staff) | **Settings** → Users tab |
| Plan configuration | **Settings** → Plans tab |

---

## Act 1 — Build your team

**Who:** You (Founder)
**Where:** Settings → Users tab
**Why:** Staff don't self-register. The Founder invites each one, which creates
their account and produces a registration link.

### Steps

1. Log in as the **Founder** in your main browser window.
2. Click **Settings** in the sidebar → click the **Users** tab.
3. Click the **Invite** button (top right area of the page).
4. Fill in: **Name**, **Email** (make up anything), **Phone** (optional), **Role** (pick from the dropdown).
5. Click **Send Invite**.
6. You'll see a **registration link** appear — **copy it**.
7. Open an **Incognito window** → paste the link → you'll be asked to set a password → set one and submit.
8. You should land on the Dashboard. Check that the correct role name appears at the bottom of the sidebar.
9. Close that Incognito window (or keep it open if you'll use this user soon).
10. Repeat for all 7 staff members:

| Name | Email (anything works) | Role to select |
|------|------------------------|----------------|
| Olivia Ops | olivia@test.com | Operations Head |
| Carl CRO | carl@test.com | CRO |
| Coach Kim | kim@test.com | Client Coach |
| Sara Skin | sara@test.com | Skincare Consultant |
| Femi Fit | femi@test.com | Fitness Trainer |
| Stella Style | stella@test.com | Styling Consultant |
| Mia Media | mia@test.com | Media |

### After creating all staff: set consultant pay rates

This is important for later — without pay rates, completing a session won't
auto-create payout expenses in Act 6.

1. Still in Settings → Users (as Founder).
2. Find **Sara Skin** in the user list → click the **Edit** icon (pencil).
3. You should see a **Per-session rate** field → enter an amount (e.g., 500).
4. Save.
5. Repeat for **Femi Fit** and **Stella Style**.

### What to verify

- [ ] All 7 staff members invited and can log in via their registration links
- [ ] Each role's Dashboard page looks different (different widgets/data appear based on role)
- [ ] Sara, Femi, and Stella have per-session rates saved
- [ ] **Negative test:** Log in as any non-Founder user → confirm they do NOT see Settings → Users (only the Founder manages staff)

---

## Act 2 — Create and invite a client

**Who:** Carl CRO (log in as Carl in an Incognito window)
**Where:** Clients page
**Why:** This is the top of the sales funnel. The CRO captures a prospect and
sends them a portal link so they can self-onboard.

### Steps

1. Open an Incognito window → go to the app URL → log in as **Carl CRO**.
2. Click **Clients** in the sidebar → click **New Client** (or the "+" button).
3. Fill in the form:
   - **Name:** Aarav Mehta
   - **Type:** Groom (select from dropdown)
   - **Wedding date:** pick something ~3 months from today
   - **City:** Mumbai (or any city)
   - **Phone:** any number (e.g., 9876543210)
   - **Email:** aarav@test.com
   - **Lead source:** pick one from the dropdown if options are available
   - **Notes:** optional
4. Click **Save** → Aarav is created as a **Lead**.
5. You should land on Aarav's profile page. Look for an **Invite** button.
6. Click **Invite** → a panel slides open with a **registration link** → **copy it**.

### What to verify

- [ ] Aarav appears in the Clients list with status **Lead**
- [ ] Carl is automatically listed as Aarav's **CRO** (the system auto-assigns the person who invites)
- [ ] The registration link was generated and is copyable
- [ ] Aarav's lead phase shows as **Invited** (since an invite was sent)

---

## Act 3 — Aarav onboards himself

**Who:** Aarav (client) — open a NEW Incognito window (separate from Carl's)
**Where:** Client portal → onboarding wizard
**Why:** Onboarding is entirely client self-service. Staff don't do this part.
Aarav sets his password, fills out his assessment, picks a plan, and uploads
payment proof.

### Steps

1. Open a **new Incognito window** (don't reuse Carl's — you need both sessions).
2. Paste Aarav's registration link → set a password → submit.
3. You'll land on the **Onboarding Wizard** — a 3-step process shown at the top:
   **Assessment → Choose Plan → Payment**

#### Step 1: Assessment

4. Fill out the assessment form. It has multiple sections:

   | Section | Fields |
   |---------|--------|
   | **General** | Name, age, wedding date (pre-filled), city |
   | **Skincare** | Skin type (dropdown), skin concerns (multi-select checkboxes), current routine (text), allergies (text) |
   | **Fitness** | Fitness level (dropdown), height, weight, health conditions (text), dietary restrictions (dropdown), fitness goals (multi-select) |
   | **Styling** | Body type (text), style preferences (multi-select), budget range (dropdown), color preferences (text) |

5. Click **Submit** / **Next** to move to step 2.

#### Step 2: Choose Plan

6. You'll see available plans for the Groom type (e.g., "GTB 3 Month Premium").
7. Each plan card shows:
   - Plan name and price (in INR)
   - Duration (e.g., 3 months)
   - What services are included: number of skincare, fitness, and styling sessions
   - Installment breakdown (how many payments, how much each)
8. Click **Select** on a plan → confirm the selection.

#### Step 3: Payment

9. You'll see the first installment amount due.
10. There will be a file upload area — click it or drag a file.
11. Upload a payment proof (use one of your dummy images — any PNG/JPG/PDF works).
12. Click **Submit**.

#### After onboarding

13. You should land on the **client portal home page** (`/portal`) showing a wedding countdown and any upcoming info.

### What to verify

- [ ] Assessment form saved successfully (no errors, moved to step 2)
- [ ] Plan selection worked — the plan details were visible before selecting
- [ ] Payment proof uploaded for installment #1 (file upload completed)
- [ ] Aarav landed on the portal home page after finishing all 3 steps
- [ ] **Cross-check:** Go back to the staff portal (as Carl or Founder) → open Aarav's profile → his lead phase should now show **payment_submitted**

---

## Act 4 — Convert Aarav

**Who:** Carl CRO
**Where:** Payments page
**Why:** The CRO verifies the payment proof and approves it. This first approval
is the magic moment — it flips the client from Lead to Converted, which is how
the system records that a sale was closed.

### Steps

1. Switch to **Carl's Incognito window**.
2. Click **Payments** in the sidebar.
3. Find Aarav's pending payment — it should show the proof image/file he uploaded.
4. Click on it to open the details → click **Approve**.
5. You may be asked to select a payment method (e.g., bank transfer, UPI, cash) — pick any one.
6. Confirm.

### What to verify

- [ ] Aarav's status changes from **Lead → Converted** (check his profile in Clients)
- [ ] The conversion details are recorded (who approved it, when)
- [ ] A notification fires — check the **bell icon** (top-right of the header) for a notification about the conversion
- [ ] On the Payments page, Aarav's payment now shows as **Approved** instead of pending

---

## Act 5 — Assign team and activate

**Who:** Olivia Ops (or Founder) — **NOT** Carl CRO
**Where:** Assignments page
**Why:** Now that Aarav is converted (paid), Operations builds his delivery team
and activates him. **Activation is what generates his entire session schedule**
from the plan rules and wedding date. Without this step, there are no sessions.

**Important:** The CRO cannot do this step — it's an operations responsibility.
If you want, try logging in as Carl and confirm he either can't see the
Assignments page or can't perform the activation.

### Steps

1. Open an Incognito window → log in as **Olivia Ops**.
2. Click **Assignments** in the sidebar.
3. Find **Aarav Mehta** in the list → click to open his assignment.
4. You'll see dropdown fields to assign his team. Select:
   - **Coach:** Coach Kim
   - **Skincare Consultant:** Sara Skin
   - **Fitness Trainer:** Femi Fit
   - **Styling Consultant:** Stella Style
5. Click **Save** — you must save the team before you can activate.
6. After saving, the **Activate & Schedule** button should become enabled (it was greyed out before).
7. Click **Activate & Schedule**.
8. You should see a success message like _"Activated — 20 sessions scheduled"_ (the exact number depends on the plan Aarav picked).

### What to verify

- [ ] All 4 team members were assignable and saved
- [ ] The Activate button was disabled/greyed out until after saving
- [ ] After activation: Aarav's status changed to **Active** (check his profile)
- [ ] Sessions appeared: go to **Clients** → Aarav → **Sessions** tab → you should see a full schedule of upcoming sessions with dates
- [ ] Follow-ups were seeded: check the **CRO Tracking** page → there should be upcoming follow-ups for Aarav
- [ ] **Negative test:** Log in as Carl CRO → confirm he can't see the Assignments page or can't click Activate

### Troubleshooting

| Problem | Fix |
|---------|-----|
| A consultant dropdown says "No … available" | That role wasn't created in Act 1. Go back and invite them as Founder. |
| Activate button stays disabled after assigning | You haven't clicked **Save** yet. Save first, then Activate enables. |

---

## Act 6 — Deliver sessions

**Who:** Sara Skin, Femi Fit (the consultants)
**Where:** Consultations page
**Why:** This is the daily work. Each consultant sees only their own service's
sessions. Completing a session records that the work happened, and — because
you set a pay rate in Act 1 — automatically creates a **payout expense** for
that consultant.

### Steps

1. Open an Incognito window → log in as **Sara Skin**.
2. Click **Consultations** in the sidebar.
3. You should see Sara's upcoming **skincare** sessions for Aarav (only skincare, because that's Sara's service).
4. Click on a session to open it → click **Complete**.
5. Fill in the completion form:
   - **Date completed:** defaults to today, leave as-is or adjust
   - **Notes:** type anything (e.g., "Initial skin assessment done, recommended hydration routine")
   - **Attach a document:** optionally upload a PDF (this becomes the "skincare plan" the client can download)
6. Save/submit.
7. Log out → log in as **Femi Fit** → repeat the same process for one **fitness** session.

### Also try these

- [ ] **Reschedule** a future session (don't complete it — just reschedule) → its status should change to indicate it's been moved
- [ ] If there's a **calendar view** toggle, switch to it to see sessions in calendar format instead of a list

### What to verify

- [ ] Completed session shows status "Completed" with the notes you entered
- [ ] A **pending payout expense** auto-appeared: go to **Expenses** page → look for an auto-created payout for Sara (this only works if her pay rate was set in Act 1)
- [ ] If Sara uploaded a document, it appears in the **Documents** page
- [ ] **Cross-check as Aarav:** log into the client portal as Aarav → the completed session should be visible in his Sessions page
- [ ] Aarav received a notification about the completed session (check the bell icon in the portal)

---

## Act 7 — The client experience

**Who:** Aarav (client)
**Where:** Client portal (the `/portal` pages)
**Why:** This is what the paying client sees. The portal has 5 sections — Home,
Sessions, Payments, Documents, and Profile. Test that each one works.

### Steps (as Aarav)

Switch to Aarav's Incognito window (or open a new one and log in as Aarav).

#### Home page
1. You should see: wedding countdown, upcoming sessions, and recent activity.

#### Sessions page
2. Click **Sessions** in the top nav (or bottom nav on mobile).
3. Find the session Sara completed in Act 6.
4. Click **Rate** → give it a star rating (1-5) and optionally write feedback text.
5. Submit the rating.

#### Payments page
6. Click **Payments** in the nav.
7. You should see the installment schedule — the first one approved, and possibly more due.
8. If there's a next installment with an **Upload Proof** button, click it → upload an image.

#### Documents page
9. Click **Documents** in the nav.
10. If Sara uploaded a skincare plan in Act 6, it should appear here.
11. Click on the document to open or download it.

#### Profile page
12. Click **Profile** in the nav.
13. Try editing some personal details (name, phone, etc.) → save.
14. Try changing the password.

### What to verify

- [ ] Home page shows wedding countdown and upcoming sessions
- [ ] Session rating saved successfully (stars + feedback visible)
- [ ] Payment proof uploaded for the next installment
- [ ] Document is viewable/downloadable
- [ ] Profile edits save correctly
- [ ] Password change works (sign out and back in with the new password)
- [ ] All 5 portal tabs (Home, Sessions, Payments, Documents, Profile) load without errors

---

## Act 8 — Follow-ups and retention

**Who:** Carl CRO (and/or Coach Kim)
**Where:** CRO Tracking page
**Why:** Follow-ups keep staff accountable for regularly touching base with
clients. They were auto-seeded when Aarav was activated in Act 5. Completing a
follow-up auto-schedules the next recurring one.

### Steps

1. Log in as **Carl CRO**.
2. Click **CRO Tracking** in the sidebar.
3. Find a due follow-up for Aarav.
4. Click **Complete** on the follow-up → confirm.
5. Check that the next recurring follow-up was auto-created (it should appear with a future date).
6. Find another follow-up → try **Snooze** (this postpones it by a few days).
7. Try creating a brand new follow-up using the **New follow-up** button.
8. Look for a "not contacted in 7+ days" banner — it may not appear yet since
   you just completed a follow-up, but note where it would show.

### What to verify

- [ ] Completing a follow-up auto-creates the next recurring one
- [ ] Snooze pushes the follow-up date forward
- [ ] New manual follow-up can be created with a custom date/note
- [ ] **Cross-check:** Log in as **Coach Kim** → she should also see and be able to complete follow-ups on CRO Tracking

---

## Act 9 — Styling operations

**Who:** Stella Style (styling consultant)
**Where:** Styling Operations page
**Why:** Styling has its own mini-project workflow on top of the regular styling
sessions. It covers outfits, accessories, travel logistics, and a delivery
checklist. The styling consultant manages it through stages.

### Steps

1. Log in as **Stella Style**.
2. Click **Styling Operations** in the sidebar.
3. Click **New** to create a styling operation for Aarav.
4. Fill in the form: date, location, travel details, etc.
5. Save → the operation appears with a **checklist** of items.
6. Start ticking checklist items one by one.
7. Watch the operation's status — it should auto-advance through stages:
   **upcoming → in_progress → completed** (as more items are checked off).

### What to verify

- [ ] Styling operation created with the details you entered
- [ ] Checklist items are clickable/interactive
- [ ] Status auto-advances as you tick more items
- [ ] **Negative test:** Other non-styling roles shouldn't be able to create styling operations (try as Carl CRO or Coach Kim)

---

## Act 10 — Expenses (money out)

**Who:** Sara Skin submits; Olivia Ops or Founder approves
**Where:** Expenses page
**Why:** Any staff member can submit an expense claim. Only Ops Head and Founder
can approve or reject them. The auto-created consultant payouts from Act 6 also
flow through here.

### Steps

#### Part A: Submit an expense (as Sara Skin)

1. Log in as **Sara Skin**.
2. Click **Expenses** in the sidebar → click **Submit Expense** (or "New" button).
3. Fill in: description, amount, category.
4. Optionally link it to a client (select Aarav) — this may enable a receipt upload.
5. Submit.

#### Part B: Approve/reject expenses (as Olivia Ops or Founder)

6. Switch to **Olivia Ops** or **Founder**.
7. Go to **Expenses** → you should see multiple pending items:
   - Sara's manual expense (from Part A)
   - The auto-created payout expenses from Act 6 (consultant session payouts)
8. **Approve** one expense.
9. **Reject** a different one — you should be prompted to enter a reason.

### What to verify

- [ ] Sara can submit expenses but does NOT see approve/reject buttons
- [ ] Olivia/Founder can approve and reject
- [ ] Rejected expense clearly shows the rejection reason
- [ ] The **stat cards** at the top of the Expenses page update (approved total, pending total, payouts total should reflect your actions)
- [ ] The auto-payout expenses from session completions in Act 6 are visible alongside manual expenses

---

## Act 11 — Tasks, Media, and Documents

**Who:** Various roles
**Where:** Team Tasks, Media, and Documents pages

### Team Tasks

A kanban board for internal task management. Any staff member can use it.

1. Log in as any staff member.
2. Click **Team Tasks** in the sidebar.
3. Click to create a **New Task**.
4. Fill in: title, description, assign it to a team member, set a priority level, and a due date.
5. The task card appears in a column (e.g., "To Do").
6. **Drag** the task card to the next column (e.g., "In Progress").
7. Drag it again to "Done."

What to verify:
- [ ] Task created with correct assignee, priority, and due date
- [ ] Drag-and-drop between columns works smoothly
- [ ] The assigned person can see the task when they log in

### Media

The content pipeline. Only the Media role and Founder can access this page.

1. Log in as **Mia Media** (or Founder).
2. Click **Media** in the sidebar.
3. Click **New Content** → fill in details (title, platform like Instagram/YouTube, campaign name, etc.).
4. The content card appears in the **Planned** column.
5. **Drag** it through the production stages: Planned → Shooting → Editing → Review → Posted.
6. Try the filters (by campaign, platform, or content owner).

What to verify:
- [ ] Content card created and visible in the Planned column
- [ ] Drag-and-drop through stages works
- [ ] Filters narrow the displayed content correctly
- [ ] **Negative test:** Log in as a non-Media role (e.g., Sara Skin) → the Media page should not appear in the sidebar or should be inaccessible

### Documents

A searchable library of every document uploaded across the system (session
plans, payment proofs, etc.).

1. Log in as Founder or any staff with document access.
2. Click **Documents** in the sidebar.
3. Try **searching** by document name.
4. Try **filtering** by document type.
5. Click a document to open it (opens via a signed URL — usually a new tab).
6. Try uploading a new document manually.

What to verify:
- [ ] Search returns matching results
- [ ] Filter by type narrows the list
- [ ] Documents open successfully when clicked
- [ ] New document upload works

---

## Act 12 — Dashboards, Reports, and Alerts

**Who:** Founder (or Ops Head)
**Where:** Dashboard, Reports, Alerts pages
**Why:** Everything from the previous acts rolls up into live dashboards. This
is where leadership gets the bird's-eye view of the business.

### Dashboard

1. Log in as **Founder**.
2. Click **Dashboard** in the sidebar (first item).
3. Check that these widgets/sections are populated with real data from your testing:

| Widget | What it should show |
|--------|-------------------|
| Revenue chart | Reflects the payments you approved |
| Pipeline | Counts of leads, converted, active clients |
| Today's agenda | Any sessions or follow-ups due today |
| Upcoming weddings | Aarav's wedding date |
| Recent activity | Actions from earlier acts (session completed, payment approved, etc.) |
| At-risk clients | Clients with no recent activity (may be empty if you just did everything today) |

What to verify:
- [ ] Revenue numbers reflect the approved payments from Acts 4/7
- [ ] Pipeline counts match actual client statuses you've created
- [ ] Recent activity shows real actions from your testing session

### Reports

1. Click **Reports** in the sidebar.
2. Click through **all report tabs** (there should be approximately 6 different report views).
3. Try changing the **time period** filter (this month, last month, custom date range).
4. Try clicking **CSV export** on at least one report.

What to verify:
- [ ] All report tabs load without errors or blank screens
- [ ] Changing the period filter actually changes the displayed data
- [ ] CSV file downloads successfully and contains data

### Alerts

1. Click **Alerts** in the sidebar.
2. You should see computed alerts — these are auto-generated based on data conditions:
   - Overdue payments (installments past their due date)
   - At-risk clients (no recent session activity)
   - Upcoming styling operations
   - Other business-rule-driven alerts
3. Click on an alert row → it should navigate you to the relevant record (client, payment, etc.).

What to verify:
- [ ] Alert rows are present (some may require specific data conditions — see note below)
- [ ] Clicking an alert navigates to the correct page/record

**Note:** Some alerts only appear when specific conditions are met (e.g.,
"overdue" requires a payment past its due date). If the Alerts page is empty,
it may just mean none of those conditions exist yet with the data you've
created. Report it to the project owner for guidance on how to trigger them.

### Notifications (bell icon)

1. Click the **bell icon** in the top-right corner of the page header.
2. You should see notifications accumulated across all the acts — payment
   approved, session completed, client activated, etc.

What to verify:
- [ ] Notifications are present and reflect real events
- [ ] Clicking a notification navigates to the relevant item

---

## Progress tracker

Copy this checklist to track your testing progress:

| Act | Status | Notes |
|-----|--------|-------|
| 1 — Build team | ☐ | All 7 staff + pay rates for consultants |
| 2 — Create lead | ☐ | Aarav created and invited |
| 3 — Client onboards | ☐ | Assessment + plan + payment proof |
| 4 — Convert | ☐ | Lead → Converted |
| 5 — Assign & activate | ☐ | Converted → Active, sessions generated |
| 6 — Deliver sessions | ☐ | Sessions completed, payouts created |
| 7 — Client portal | ☐ | Rate, pay, view docs, edit profile |
| 8 — Follow-ups | ☐ | Complete, snooze, create |
| 9 — Styling ops | ☐ | Create, checklist, auto-advance |
| 10 — Expenses | ☐ | Submit, approve, reject |
| 11 — Tasks/Media/Docs | ☐ | Kanban, content pipeline, doc library |
| 12 — Dashboards/Reports | ☐ | All widgets populated, CSV export, alerts |

---

## Common issues and what to do

| Problem | Likely cause | What to do |
|---------|-------------|------------|
| Consultant dropdown says "No … available" | That role wasn't invited in Act 1 | Tell the project owner, or go back as Founder and invite that role |
| "Activate" button stays greyed out | Team wasn't saved yet | Click **Save** after assigning consultants, then the Activate button enables |
| No payout expense after completing a session | Consultant has no per-session rate | Tell the project owner — the rate needs to be set in Settings → Users |
| Client portal shows onboarding wizard instead of the home page | Onboarding wasn't fully completed | Make sure all 3 onboarding steps were finished (assessment, plan, payment) |
| Dashboard shows no data / empty widgets | No clients have been processed yet | Complete Acts 1-6 first — dashboard data is derived from real records |
| Registration link doesn't work or goes to wrong page | Link may have expired (valid ~1 hour) | Ask the project owner to re-send the invite |
| Page shows a blank screen or error | Could be a bug | Note the URL, what role you were logged in as, and what you did before it broke — report it |

---

## How to report bugs

When you find something that doesn't work as described, capture:

1. **What you did** — the exact steps (which act, which role, what you clicked)
2. **What you expected** — based on this guide or common sense
3. **What actually happened** — error message, blank screen, wrong data, etc.
4. **Screenshot** — if possible, take a screenshot showing the issue
5. **Which user/role** you were logged in as
6. **Browser** — which browser and whether it was a normal or Incognito window

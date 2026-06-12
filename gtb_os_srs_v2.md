# GTB OS — Software Requirements Specification v2.0

**Project:** GTB OS (Groom To Be / Glow To Be Operating System)
**Version:** 2.0 Draft
**Date:** 2026-06-11
**Prepared By:** Ishak K, Aadil

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Glossary](#2-glossary)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Authentication & Access Control](#4-authentication--access-control)
5. [Client Lifecycle](#5-client-lifecycle)
6. [Onboarding Flow](#6-onboarding-flow)
7. [Plan Management](#7-plan-management)
8. [Payment Module](#8-payment-module)
9. [Consultation & Session Management](#9-consultation--session-management)
10. [Styling Operations](#10-styling-operations)
11. [Calendar & Scheduling](#11-calendar--scheduling)
12. [CRO Tracking & Follow-ups](#12-cro-tracking--follow-ups)
13. [Client Satisfaction](#13-client-satisfaction)
14. [Assignment Module](#14-assignment-module)
15. [Expense Tracker](#15-expense-tracker)
16. [Document Management](#16-document-management)
17. [Team Task Management](#17-team-task-management)
18. [Notifications & Alerts](#18-notifications--alerts)
19. [Dashboards](#19-dashboards)
20. [Reports](#20-reports)
21. [Media Dashboard](#21-media-dashboard)
22. [Settings & Administration](#22-settings--administration)
23. [Data Entities](#23-data-entities)
24. [Business Rules & Edge Cases](#24-business-rules--edge-cases)
25. [Non-Functional Requirements](#25-non-functional-requirements)
26. [Future Phase](#26-future-phase)
27. [Assumptions Log](#27-assumptions-log)

---

## 1. Project Overview

GTB OS is a web-based platform for managing the complete lifecycle of clients enrolled in **Groom To Be** (GTB) and **Glow To Be** transformation programs. These programs help grooms and brides prepare for their wedding through skincare, fitness, and styling services.

### 1.1 Scope

The platform serves two audiences:

- **Staff Portal** — Used by CROs, consultants, coaches, operations, media team, and the founder to manage clients, track operations, handle payments, and monitor performance.
- **Client Portal** — A simpler interface where clients view their plan, see upcoming sessions, upload payment proofs, rate completed sessions, and access their documents.

Both portals share a single backend. The frontend adapts styling based on client type (Groom/Bride) — different color schemes and branding, same functionality.

### 1.2 Core Problem

Currently, client management, consultant coordination, payment tracking, and follow-ups are handled manually across WhatsApp, spreadsheets, and phone calls. GTB OS centralizes everything into one system.

---

## 2. Glossary

| Term | Definition |
|------|-----------|
| **Client** | A groom or bride enrolled (or being enrolled) in a GTB/Glow program |
| **CRO** | Customer Relationship Officer — handles sales, client onboarding, follow-ups, and payment approvals |
| **Client Coach** | Manages the client's overall journey, coordinates between consultants, handles escalations |
| **Consultant** | Specialist providing a specific service: skincare, fitness, or styling |
| **Plan** | A configurable package of services with a defined duration, price, and set of included sessions |
| **Session** | A single consultation or appointment between a client and a consultant |
| **Lead** | A potential client who has been entered into the system but hasn't paid yet |
| **Conversion** | The point at which a lead's first payment is approved, becoming a paying client |
| **Lead Source** | How the client heard about GTB/Glow (Instagram, referral, YouTube, etc.) |

---

## 3. User Roles & Permissions

### 3.1 Roles

| Role | Description |
|------|-------------|
| **Founder** | Full system access. Views reports, revenue, performance metrics, manages users and settings. |
| **Operations Head** | Oversees daily operations. Assigns consultants, monitors pending tasks, generates reports. |
| **CRO** | Client-facing. Captures leads, invites clients, approves payments, conducts follow-ups. |
| **Client Coach** | Manages assigned clients' journeys. Coordinates consultants, handles escalations. |
| **Skincare Consultant** | Conducts skincare sessions, uploads skincare plans and notes. |
| **Fitness Trainer** | Conducts fitness sessions, uploads fitness plans and notes. |
| **Styling Consultant** | Conducts styling sessions, uploads guides, manages styling operations. |
| **Media Team** | Manages content calendar and campaign tracker. No client data access. |
| **Client** | Views own plan, sessions, payments, documents. Uploads payment proofs. Rates sessions. |

### 3.2 Permission Matrix

| Capability | Founder | Ops Head | CRO | Coach | Consultant | Media | Client |
|-----------|---------|----------|-----|-------|------------|-------|--------|
| View all clients | Yes | Yes | — | — | — | — | — |
| View assigned clients | — | — | Yes | Yes | Yes | — | — |
| View own profile/plan | — | — | — | — | — | — | Yes |
| Create/edit lead | Yes | Yes | Yes | — | — | — | — |
| Invite client | Yes | Yes | Yes | — | — | — | — |
| Assign consultants | Yes | Yes | — | — | — | — | — |
| Approve/reject payments | Yes | Yes | Yes | — | — | — | — |
| Upload payment proof | — | — | — | — | — | — | Yes |
| Record payment (manual) | Yes | Yes | Yes | — | — | — | — |
| Mark session completed | — | — | — | — | Yes | — | — |
| Upload session notes/plans | — | — | — | — | Yes | — | — |
| Rate session | — | — | — | — | — | — | Yes |
| Conduct follow-ups | — | — | Yes | Yes | — | — | — |
| View all payments | Yes | Yes | — | — | — | — | — |
| View assigned client payments | — | — | Yes | Yes | — | — | — |
| View own payments | — | — | — | — | — | — | Yes |
| View/download documents | Yes | Yes | Yes | Yes | Own uploads | — | Own docs |
| Manage plans | Yes | — | — | — | — | — | — |
| Manage users/staff | Yes | — | — | — | — | — | — |
| View full reports | Yes | Yes | — | — | — | — | — |
| View own performance | — | — | Yes | Yes | Yes | — | — |
| Submit expenses | Yes | Yes | Yes | Yes | Yes | Yes | — |
| Approve expenses | Yes | Yes | — | — | — | — | — |
| View expense reports | Yes | Yes | — | — | — | — | — |
| Manage media content | Yes | — | — | — | — | Yes | — |
| Manage lead sources | Yes | Yes | — | — | — | — | — |
| System settings | Yes | — | — | — | — | — | — |
| Calendar (all) | Yes | Yes | — | — | — | — | — |
| Calendar (own/assigned) | — | — | Yes | Yes | Yes | — | Yes |

---

## 4. Authentication & Access Control

### 4.1 Staff Login

- Email + password authentication.
- Staff accounts are created by the Founder via the Settings panel.
- Password reset via email.
- Session-based or JWT authentication.

### 4.2 Client Registration

- CRO invites a client by entering their name, email, and phone number.
- System sends an invitation email containing a unique registration link.
- Client clicks link and completes registration:
  - Sets a password.
  - Confirms phone number.
  - Completes the onboarding assessment (Section 6).
- The inviting CRO is automatically assigned as the client's CRO.
- Invitation link expires after 7 days. CRO can resend.

### 4.3 Role-Based Access

- Every API endpoint and UI route is gated by role.
- Staff see only what their role permits (Section 3.2).
- Clients see only their own data.
- Consultants, coaches, and CROs see only their assigned clients.

---

## 5. Client Lifecycle

### 5.1 Statuses

```
Lead ──→ Converted ──→ Active ──→ Completed
                          │
                          ├──→ On Hold
                          │
                          └──→ Cancelled
```

| Status | Definition | Trigger |
|--------|-----------|---------|
| **Lead** | Potential client entered into the system by CRO. May or may not be invited/registered. | CRO creates lead entry |
| **Converted** | First payment proof is approved. | CRO approves payment |
| **Active** | Consultants assigned and at least one session scheduled. | Operations Head assigns team |
| **Completed** | Wedding has occurred and all services have been delivered. | Manual status change by CRO/Ops Head |
| **On Hold** | Client temporarily pauses services. | Manual status change |
| **Cancelled** | Service terminated before completion. | Manual status change |

### 5.2 Transition Rules

- Lead → Converted: requires payment approval (full payment or first installment). No team is assigned until payment is confirmed.
- Converted → Active: requires at least one consultant assigned. Assignment only happens after payment confirmation.
- Active → Completed: all sessions must be completed or explicitly cancelled. No outstanding mandatory payments.
- Active → On Hold: pauses all upcoming session reminders. Sessions are not deleted, just paused.
- On Hold → Active: resumes reminders. Staff may need to reschedule sessions.
- Active → Cancelled: records cancellation reason. Outstanding payments are marked as written off or carried forward (manual decision).
- Cancelled clients cannot be reactivated. If the same person returns, create a new client entry.

### 5.3 Lead Sub-Statuses

Since a lead goes through several steps before converting, track these internally:

| Lead Phase | Meaning |
|-----------|---------|
| New | CRO has created the entry but hasn't contacted/invited |
| Contacted | CRO has reached out |
| Invited | Registration invitation sent |
| Registered | Client has registered and completed assessment |
| Plan Selected | Client has selected a plan |
| Payment Submitted | Client has uploaded payment proof, awaiting approval |

These are informational. The primary lifecycle status remains "Lead" until payment is approved.

---

## 6. Onboarding Flow

### 6.1 Step-by-Step Flow

1. **CRO creates lead** — enters: name, phone, email, type (groom/bride), wedding date, city, lead source, notes.
2. **CRO invites client** — system sends email with registration link.
3. **Client registers** — sets password, confirms phone number.
4. **Client completes assessment** — fills out onboarding questionnaire (Section 6.2).
5. **Client browses and selects a plan** — sees available plans for their type (GTB or Glow).
6. **Client sees payment breakdown** — total price, installment schedule (if applicable).
7. **Client uploads payment proof** — for the full plan amount or the first installment.
8. **CRO receives notification** — reviews payment proof.
9. **CRO approves payment** — client status changes to **Converted**. No team assignment happens before this step.
10. **Operations Head is notified** — new converted client needs consultant assignment.
11. **Operations Head assigns team** — Client Coach, Skincare Consultant, Fitness Trainer, Styling Consultant. CRO is already assigned from invitation.
12. **System generates session schedule** — based on plan rules + wedding date.
13. **Client receives welcome notification** — with team details and upcoming schedule.
14. **Client status becomes Active** — services begin.

### 6.2 Onboarding Assessment

The assessment form collects information needed by all three service areas. Fields:

**General:**
- Full name
- Age
- Gender (auto-set from groom/bride but editable)
- Wedding date (pre-filled from lead entry)
- City
- Profile photo upload

**Skincare:**
- Skin type (oily, dry, combination, sensitive, normal) — dropdown
- Current skin concerns (acne, pigmentation, dark circles, uneven tone, dullness, other) — multi-select
- Current skincare routine (free text)
- Known allergies (free text)
- Any dermatological conditions or ongoing treatments (free text)

**Fitness:**
- Current fitness level (beginner, intermediate, advanced) — dropdown
- Height and weight
- Health conditions or injuries (free text)
- Dietary restrictions (vegetarian, vegan, non-veg, other) — dropdown
- Fitness goals (weight loss, muscle gain, toning, general fitness, other) — multi-select

**Styling:**
- Body type (self-described or measurements) — free text
- Style preferences (classic, modern, traditional, experimental) — multi-select
- Budget range for wedding outfit (dropdown with ranges)
- Color preferences (free text)
- Any specific requirements (free text)

**Photos:**
- Full body photo (optional at registration, may be collected at first session)
- Face photo (optional)

[ASSUMPTION] These fields are a starting point. The founder can request additions before development.

---

## 7. Plan Management

Plans are fully configurable by the Founder through the admin panel. No code changes needed to add, modify, or retire a plan.

### 7.1 Plan Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Display name (e.g., "GTB 3 Month Premium") |
| client_type | Enum | `groom` or `bride` — determines which clients see this plan |
| duration_months | Integer | 1, 2, 3, or 6 |
| price | Decimal | Total package price in INR |
| description | Text | Markdown-supported description shown to clients |
| installment_count | Integer | Number of installments (1 = full payment upfront) |
| is_active | Boolean | Only active plans are shown to new clients |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### 7.2 Plan Services (What's Included)

Each plan contains one or more services. Each service defines how many sessions and when they happen relative to the wedding date.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| plan_id | FK | Reference to Plan |
| service_type | Enum | `skincare`, `fitness`, `styling` |
| total_sessions | Integer | Number of sessions included |
| start_offset_days | Integer | How many days before the wedding this service should start. Example: 90 means "start 90 days before wedding." |
| frequency_days | Integer | Days between sessions. Example: 14 means "every 2 weeks." Null for styling (manually scheduled). |
| notes | Text | Optional notes about this service in this plan |

**Example: GTB 3 Month Premium**

| Service | Sessions | Starts | Frequency |
|---------|----------|--------|-----------|
| Skincare | 6 | 90 days before wedding | Every 14 days |
| Fitness | 12 | 90 days before wedding | Every 7 days |
| Styling | 2 | 14 days before wedding | Manual |

### 7.3 Schedule Generation

When a client enrolls and is activated:
1. System reads the plan's service rules.
2. For each service, calculates session dates:
   - First session = wedding_date minus start_offset_days.
   - Subsequent sessions = previous session + frequency_days.
   - If frequency is null (e.g., styling), only the first session is auto-scheduled. Remaining sessions are scheduled manually by staff.
3. If the enrollment date is past the calculated start date for a service (e.g., client enrolls 60 days before wedding but the plan says start 90 days before), the system shifts the start to enrollment date and compresses the schedule proportionally.
4. Generated sessions can be manually adjusted by staff after creation.

### 7.4 Plan Administration

- Founder can create, edit, deactivate plans.
- Deactivating a plan does not affect existing clients on that plan. It only hides the plan from new enrollments.
- Editing a plan does not retroactively change existing client schedules. Changes only apply to new enrollments.
- Plans cannot be deleted if any client is currently enrolled in them. They can only be deactivated.

---

## 8. Payment Module

Payments are collected externally (UPI, bank transfer, cash) and recorded in the system. The client uploads proof, and the CRO approves it.

### 8.1 Payment Structure

When a client selects a plan, the system generates an installment schedule:

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | |
| client_plan_id | FK | Reference to the client's plan enrollment |
| installment_number | Integer | 1, 2, 3, ... |
| amount | Decimal | Amount due for this installment |
| due_date | Date | When this installment is due |
| status | Enum | `pending`, `proof_submitted`, `approved`, `rejected`, `overdue`, `waived` |
| payment_method | Enum | `upi`, `bank_transfer`, `cash`, `other` — set on approval |
| proof_document_id | FK | Reference to uploaded proof file |
| approved_by | FK | Staff user who approved |
| approved_at | Timestamp | |
| rejection_reason | Text | If rejected, why |
| notes | Text | |
| created_at | Timestamp | |

### 8.2 Installment Generation

- Total plan price is divided into N installments (configured in the plan).
- First installment due date = enrollment date.
- Subsequent due dates = evenly spaced across the plan duration.
- Staff can manually adjust individual installment amounts and due dates after generation (to handle negotiated discounts, custom schedules, etc.).

### 8.3 Client Payment Flow

1. Client views "My Payments" — sees installment schedule with amounts and due dates.
2. Client makes payment externally (UPI, bank transfer, cash to CRO).
3. Client uploads payment proof (screenshot, receipt photo) for the relevant installment.
4. Installment status changes to `proof_submitted`.
5. CRO receives notification.
6. CRO reviews proof and either:
   - **Approves** — selects payment method, adds optional notes. Status → `approved`.
   - **Rejects** — provides reason. Status → `rejected`. Client is notified and can re-upload.
7. On first-ever approval for this client, client status transitions from Lead → Converted.

### 8.4 Payment Summary (Per Client)

Display on client profile:
- Total Package Value
- Total Amount Paid (sum of approved installments)
- Outstanding Amount (total - paid)
- Next Due Date
- Payment Progress (percentage pie chart)

### 8.5 Manual Payment Recording

Staff (CRO, Ops Head, Founder) can also record a payment directly without client proof upload — for cases where payment was received in person (cash) or verified through other means. The recorder becomes the approver.

### 8.6 Overdue Handling

- If a due date passes without an approved payment, status changes to `overdue`.
- Overdue payments trigger alerts (Section 18).
- Overdue payments do NOT automatically block services. The CRO follows up manually.

### 8.7 Receipts

- On payment approval, the system generates a simple receipt (PDF) with: client name, amount, date, payment method, installment number, plan name.
- Receipt is stored in the Document Management module and visible to the client.

---

## 9. Consultation & Session Management

Sessions are the core service delivery unit. Each session represents one appointment between a client and a consultant.

### 9.1 Session Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | |
| client_id | FK | |
| service_type | Enum | `skincare`, `fitness`, `styling` |
| consultant_id | FK | Assigned consultant |
| session_number | Integer | 1 of 6, 2 of 6, etc. |
| scheduled_date | Date | Originally scheduled date |
| actual_date | Date | Actual completion date (may differ from scheduled) |
| status | Enum | `scheduled`, `completed`, `delayed`, `missed`, `cancelled` |
| notes | Text | Consultant's session notes |
| documents | FK[] | Linked documents (plans, guides uploaded after session) |
| rating | Integer | Client's rating (1-5), null until rated |
| rating_feedback | Text | Client's optional feedback |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### 9.2 Session Statuses

| Status | Meaning |
|--------|---------|
| **Scheduled** | Upcoming, not yet completed |
| **Completed** | Session happened, consultant marked it done |
| **Delayed** | Session was rescheduled to a later date |
| **Missed** | Scheduled date passed without completion, not rescheduled |
| **Cancelled** | Explicitly cancelled (not happening) |

### 9.3 Session Workflow

1. Sessions are auto-generated when the client is activated (Section 7.3).
2. System sends reminders to both client and consultant (1 day before, configurable).
3. Session occurs (in-person or video — managed outside the system).
4. Consultant marks session as completed, enters notes, optionally uploads a plan/guide.
5. Client receives notification: "Session complete — rate your experience."
6. Client rates (1-5 stars + optional text feedback).

### 9.4 Rescheduling

- Staff or consultant can reschedule a session by changing the scheduled date.
- Status changes to `delayed` with the new date.
- Client is notified of the change.
- Original scheduled date is preserved in history for reporting.

### 9.5 Session Tabs (UI)

The consultation tracker in the UI groups sessions by service type:
- **Skincare** tab — all skincare sessions
- **Fitness** tab — all fitness sessions
- **Styling** tab — all styling sessions

Each tab shows: session number, consultant, scheduled date, status, action buttons (mark complete, reschedule, cancel).

---

## 10. Styling Operations

Styling has additional logistics beyond a regular session: outfit selection, accessories, location, travel, and a multi-step checklist.

### 10.1 Styling Operation Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | |
| client_id | FK | |
| session_id | FK | Links to the styling session entry |
| stylist_id | FK | |
| styling_date | Date | |
| styling_location | String | City or venue |
| travel_required | Boolean | Does the stylist need to travel? |
| travel_details | Text | If yes, logistics notes |
| status | Enum | `upcoming`, `in_progress`, `completed` |
| created_at | Timestamp | |

### 10.2 Styling Checklist

Each styling operation has a checklist that must be completed:

| Checklist Item | Marked By |
|---------------|-----------|
| Styling consultation done | Consultant |
| Outfit finalized | Consultant |
| Accessories finalized | Consultant |
| Styling guide delivered | Consultant |
| Final confirmation done | Consultant/Coach |

Each item is a boolean with a timestamp of when it was marked. The styling operation is not considered complete until all checklist items are checked.

### 10.3 Styling Calendar View

Operations Head and Founder see an overview of upcoming styling operations:
- Date, client name, stylist, location, travel required, checklist progress.
- Filterable by date range, stylist, location.
- Useful for logistics planning (multiple stylings in one city on the same day).

---

## 11. Calendar & Scheduling

### 11.1 Calendar Views

**Staff Calendar:**
- Consultants see their own upcoming sessions across all assigned clients.
- CROs see their clients' upcoming sessions and follow-up dates.
- Coaches see assigned clients' sessions.
- Operations Head and Founder see everything.

**Client Calendar:**
- Client sees their own upcoming sessions, payment due dates, and key milestones.

### 11.2 Calendar Features

- Month/week/day views.
- Color-coded by service type (skincare, fitness, styling).
- Click on a session to view details.
- Staff can drag sessions to reschedule (confirmation required).
- Filter by service type, consultant, client.

### 11.3 Session Completion Marking

- Consultant marks the session as completed in the system.
- [NOTE] Client portal shows session status but the consultant is the one who marks completion. Client's action is to rate the session afterward.

---

## 12. CRO Tracking & Follow-ups

### 12.1 Follow-up Types

| Type | Description | Default Frequency |
|------|------------|-------------------|
| **Weekly Check-in** | Regular wellness/progress check | Every 7 days |
| **Payment Reminder** | Remind client of upcoming/overdue payment | 3 days before due date, again on due date |
| **Progress Update** | Update client on their plan progress | Every 14 days |
| **Satisfaction Check** | Ask client how they're feeling about services | After every 3rd session |

### 12.2 Follow-up Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | |
| client_id | FK | |
| cro_id | FK | |
| type | Enum | `weekly_checkin`, `payment_reminder`, `progress_update`, `satisfaction_check` |
| due_date | Date | When this follow-up is due |
| completed_date | Date | When it was actually done |
| status | Enum | `pending`, `completed`, `overdue` |
| notes | Text | CRO's notes from the follow-up |
| created_at | Timestamp | |

### 12.3 Auto-Generation

- Follow-ups are auto-generated based on the type's frequency when a client becomes Active.
- When a follow-up is completed, the next one is automatically created for the appropriate future date.
- Follow-ups pause when client is On Hold.

### 12.4 CRO Dashboard View

- "Due Today" — all follow-ups due today, sorted by priority (overdue > due today).
- "Overdue" — follow-ups past their due date.
- "Clients Not Contacted for 7+ Days" — automatic alert flag.
- Quick action: mark as done, add notes, snooze to tomorrow.

---

## 13. Client Satisfaction

### 13.1 Session Ratings

- After a consultant marks a session as completed, the client receives a notification to rate it.
- Rating: 1-5 stars.
- Optional text feedback.
- Client can rate from the Client Portal under "My Sessions."
- Ratings are visible to: the consultant (own sessions), the Coach, CRO, Ops Head, and Founder.

### 13.2 Satisfaction Score Calculation

- **Per Client:** Average of all session ratings.
- **Per Consultant:** Average of all ratings for their sessions.
- **Per Service Type:** Average of all ratings for that service.
- **Overall:** Average across all clients.

### 13.3 At-Risk Detection

A client is flagged as "At Risk" if any of the following are true:
- Average rating across last 3 sessions is below 3.0.
- No activity (no completed session) in 7+ days while Active.
- 2+ overdue payments.
- Client hasn't rated the last 3 completed sessions (possible disengagement).

At-risk clients appear on the Founder dashboard and trigger alerts.

---

## 14. Assignment Module

### 14.1 Assignment Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | |
| client_id | FK | |
| staff_id | FK | The assigned staff member |
| role | Enum | `cro`, `coach`, `skincare_consultant`, `fitness_trainer`, `styling_consultant` |
| assigned_by | FK | Who made the assignment |
| assigned_at | Timestamp | |
| unassigned_at | Timestamp | Null if currently active |
| is_active | Boolean | |

### 14.2 Assignment Rules

- A client must have exactly one active CRO and one active Coach.
- A client has one active consultant per service type included in their plan.
- The CRO is auto-assigned at invitation time (the CRO who invited).
- Remaining assignments are made by the Operations Head after payment approval.
- Reassignment is possible: the old assignment is deactivated (unassigned_at set), a new one is created. Full history is preserved.
- The same staff member can serve multiple roles for the same client (e.g., someone who is both a Coach and CRO).

### 14.3 Workload Visibility

- Operations Head can see each staff member's current active client count when making assignments.
- [FUTURE] Workload balancing with capacity limits and automatic suggestions.

---

## 15. Expense Tracker

### 15.1 Purpose

Track all business expenses including consultant payments, travel costs, and operational expenses.

### 15.2 Expense Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | |
| category_id | FK | Reference to expense category |
| title | String | Short description |
| amount | Decimal | INR |
| date | Date | Date of expense |
| paid_to | String | Recipient (consultant name, vendor, etc.) |
| submitted_by | FK | Staff member who submitted |
| client_id | FK | Optional — link to a client if this expense is client-related |
| status | Enum | `submitted`, `approved`, `rejected` |
| approved_by | FK | |
| approved_at | Timestamp | |
| receipt_document_id | FK | Uploaded receipt |
| notes | Text | |
| created_at | Timestamp | |

### 15.3 Expense Categories

Admin-configurable. Default categories:

| Category | Examples |
|---------|----------|
| Consultant Fee | Per-session payment to skincare/fitness/styling consultants |
| Travel | Stylist travel to client's city |
| Accommodation | Stay for outstation styling |
| Product/Material | Skincare products, styling accessories purchased for clients |
| Software/Tools | Subscriptions, platform costs |
| Marketing | Ad spend, photoshoot costs |
| Office/Operations | Rent, utilities, supplies |
| Other | Miscellaneous |

### 15.4 Consultant Payment Tracking

Consultants are contractors paid per session:
- Each consultant has a configured per-session rate (set in their staff profile, can differ by service type).
- When a session is marked completed, the system auto-creates a pending expense entry for the consultant's session fee.
- A monthly summary view shows: consultant name, sessions completed, per-session rate, total payout due.
- Staff can generate a payout report for a date range per consultant.
- Ops Head or Founder marks consultant payouts as paid (batch or individual).

### 15.5 Expense Approval Flow

1. Any staff member submits an expense with receipt.
2. Operations Head or Founder reviews and approves/rejects.
3. Approved expenses feed into the expense reports.

---

## 16. Document Management

### 16.1 Document Types

| Type | Uploaded By | Visible To |
|------|-----------|-----------|
| Assessment Form | System (from onboarding) | Staff, Client |
| Skincare Plan | Skincare Consultant | Staff, Client |
| Fitness Plan | Fitness Trainer | Staff, Client |
| Styling Guide | Styling Consultant | Staff, Client |
| Consultation Notes | Consultant | Staff only |
| Payment Proof | Client | CRO, Ops Head, Founder |
| Payment Receipt | System (auto-generated) | Staff, Client |
| Expense Receipt | Staff | Ops Head, Founder |
| Client Photos | Client or Staff | Staff, Client |

### 16.2 Storage

- All documents are stored in cloud storage (S3 or equivalent).
- Each document is linked to a client profile.
- Documents are accessible from the client's profile under the "Documents" tab.
- Clients can view and download their own documents from the Client Portal.
- Maximum file size: 10 MB per upload.
- Supported formats: JPEG, PNG, PDF, DOCX.

### 16.3 Document Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | |
| client_id | FK | |
| type | Enum | As listed above |
| file_name | String | |
| file_url | String | Cloud storage URL |
| file_size | Integer | Bytes |
| uploaded_by | FK | |
| created_at | Timestamp | |

---

## 17. Team Task Management

A general-purpose task system for internal team coordination.

### 17.1 Task Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | |
| title | String | |
| description | Text | |
| assigned_to | FK | Staff member |
| assigned_by | FK | |
| client_id | FK | Optional — link to a client |
| due_date | Date | |
| priority | Enum | `low`, `medium`, `high`, `urgent` |
| status | Enum | `pending`, `in_progress`, `completed`, `cancelled` |
| created_at | Timestamp | |
| completed_at | Timestamp | |

### 17.2 Features

- Any staff member can create a task and assign it to any other staff member.
- Tasks can be linked to a client (optional).
- Tasks appear on the assigned person's dashboard.
- Overdue tasks (past due date, not completed) are highlighted.
- Filter by: assigned to, status, priority, client, date range.

---

## 18. Notifications & Alerts

### 18.1 Notification Channels

**MVP:**
- In-app notifications (bell icon with unread count).
- Email notifications for important events.

**Future:**
- WhatsApp notifications.
- SMS notifications.
- Push notifications (mobile app).

### 18.2 Notification Events

| Event | Recipients | Channel |
|-------|-----------|---------|
| New client invitation sent | Client | Email |
| Client registered | CRO | In-app |
| Payment proof uploaded | CRO | In-app + Email |
| Payment approved | Client | In-app + Email |
| Payment rejected | Client | In-app + Email |
| Consultant assigned | Client, Consultant | In-app + Email |
| Session reminder (1 day before) | Client, Consultant | In-app + Email |
| Session completed | Client | In-app |
| Session rated | Consultant | In-app |
| Follow-up due | CRO | In-app |
| Payment due in 3 days | Client, CRO | In-app + Email |
| Payment overdue | Client, CRO, Founder | In-app + Email |
| Client at risk | Founder, Ops Head, Coach | In-app |
| Task assigned | Staff member | In-app |
| Task overdue | Staff member, assigner | In-app |
| Styling operation in 7 days | Stylist, Ops Head | In-app |
| New expense submitted | Ops Head | In-app |
| Expense approved/rejected | Submitter | In-app |

### 18.3 Alert Rules (Founder Dashboard)

These appear as persistent alerts, not one-time notifications:

| Alert | Condition |
|-------|----------|
| Payment Due Today | Any installment with due_date = today and status = pending |
| Consultation Due Today | Any session with scheduled_date = today and status = scheduled |
| Styling Tomorrow | Any styling operation with styling_date = tomorrow |
| Pending Follow-up | Any follow-up past due_date and not completed |
| Client At Risk | Any client flagged by at-risk rules (Section 13.3) |
| Overdue Payments | Any installment past due_date, not approved |
| No Activity 7+ Days | Active clients with no completed session in 7+ days |

### 18.4 Notification Preferences

- Staff can configure which notifications they receive via email vs in-app only.
- Clients receive all notifications relevant to them (no configuration in MVP).

---

## 19. Dashboards

### 19.1 Founder Dashboard

**Top Stats Row:**
- Total Active Clients (with month-over-month delta)
- Groom Clients count
- Bride Clients count
- Monthly Revenue (sum of approved payments this month)
- Outstanding Payments (sum of pending + overdue installments)
- Consultations Pending (scheduled sessions for the upcoming 7 days)

**Second Row:**
- Styling Sessions Upcoming (next 7 days)
- Clients At Risk (count)
- Media Tasks Pending
- CRO Follow-ups Due Today

**Quick Stats Panel:**
- Sales This Month (new conversions)
- Collections This Month (payments approved)
- Pending Collections
- Conversion Rate (converted / total leads this month)
- Active Team Members

**Monthly Revenue Chart:**
- Line chart: revenue vs collections over the last 6 months.

**Recent Activities:**
- Timeline of recent system-wide activities (consultations completed, payments received, guides uploaded, follow-ups done).
- Filterable. Shows last 20 items with "View All" link.

**Alerts Panel:**
- Persistent alerts as defined in Section 18.3.
- Click to navigate to the relevant client or record.

### 19.2 Operations Head Dashboard

Similar to Founder but without revenue details:
- Pending Consultations
- Pending Plans (sessions needing plans uploaded)
- Pending Guides (styling guides not yet delivered)
- Pending Follow-ups
- Upcoming Styling Operations
- Unassigned clients (Converted but no consultants assigned)
- Overdue sessions

### 19.3 CRO Dashboard

- My Clients (list with quick status indicators)
- Follow-ups Due Today
- Payment Reminders Due
- Recently Converted Clients
- Clients Not Contacted in 7+ Days
- My Performance: conversions this month, follow-up completion rate

### 19.4 Consultant Dashboard

- My Upcoming Sessions (next 7 days)
- My Clients (with their next session dates)
- Pending plan/guide uploads (sessions completed but no document uploaded)
- My Performance: sessions completed this month, average rating

### 19.5 Coach Dashboard

- My Clients (with overall progress indicator)
- Escalations / At-Risk Clients
- Pending tasks
- Upcoming milestones (sessions, styling dates, wedding dates)

### 19.6 Client Dashboard

- Wedding countdown (days remaining)
- Current plan summary
- Upcoming sessions (next 3)
- Assigned team (names, roles, profile photos)
- Payment status (paid / due / next due date)
- Quick actions: upload payment proof, view documents
- Recent activity timeline (own events only)

---

## 20. Reports

All reports support date range filtering and export to CSV/PDF.

### 20.1 Revenue Reports

- **Monthly Revenue:** Total approved payments per month. Chart + table.
- **Package-wise Revenue:** Revenue broken down by plan type.
- **Client-type Revenue:** Groom vs Bride revenue split.

### 20.2 Collection Reports

- **Collection Rate:** (amount collected / amount due) for a period.
- **Outstanding Payments:** All clients with overdue amounts, sorted by amount.
- **Payment Timeline:** When payments were received vs when they were due.

### 20.3 Sales Reports

- **Conversion Rate:** Leads converted / total leads per period.
- **Lead Source Analysis:** Conversions by lead source.
- **CRO-wise Conversions:** Which CRO converted how many clients.
- **Average Deal Size:** Average package value of conversions.

### 20.4 Performance Reports

- **CRO Performance:** Clients managed, follow-up completion rate, conversion rate, client satisfaction.
- **Coach Performance:** Clients managed, escalation rate, client satisfaction.
- **Consultant Performance:** Sessions completed, average rating, plan upload timeliness.

### 20.5 Client Reports

- **Client Satisfaction:** Overall and per-service ratings trend.
- **Active Clients:** Count over time, by status.
- **At-Risk Clients:** Current list with reasons.

### 20.6 Expense Reports

- **Monthly Expenses:** Total spend per category.
- **Consultant Payouts:** Per-consultant payment summary for a period.
- **Expense vs Revenue:** Profitability view (revenue minus expenses).

### 20.7 Operational Reports

- **Session Completion Rate:** Completed vs scheduled per period.
- **Styling Operations Summary:** Upcoming, in-progress, completed.
- **Task Completion Rate:** Team task metrics.

---

## 21. Media Dashboard

### 21.1 Content Pipeline

Track content through stages:

| Stage | Meaning |
|-------|---------|
| Planned | Content idea approved, not yet produced |
| Shooting | Photo/video shoot scheduled or in progress |
| Editing | Post-production |
| Review | Ready for review before publishing |
| Posted | Published on social media |

### 21.2 Content Item Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | |
| title | String | |
| content_type | Enum | `photo`, `video`, `reel`, `carousel`, `story`, `blog` |
| campaign | Enum | `gtb`, `glow_to_be`, `general` |
| platform | Enum | `instagram`, `youtube`, `facebook`, `website`, `other` |
| owner_id | FK | Media team member responsible |
| deadline | Date | |
| status | Enum | As defined above |
| notes | Text | |
| created_at | Timestamp | |

### 21.3 Media Dashboard View

- Kanban board view: columns for each stage, cards for content items.
- Calendar view: content items by deadline.
- Filter by campaign, platform, owner.
- Only accessible to Media Team and Founder.

---

## 22. Settings & Administration

### 22.1 User Management

Founder can:
- Create staff accounts (name, email, role, phone).
- Deactivate staff accounts (does not delete — preserves history).
- Edit staff details and roles.
- Reset staff passwords.

### 22.2 Plan Management

Founder can:
- Create new plans (Section 7).
- Edit existing plans.
- Activate/deactivate plans.
- Configure services per plan.

### 22.3 Lead Source Management

Founder or Ops Head can:
- Add new lead sources (e.g., "Instagram", "YouTube", "Friend Referral", "Google", "Event").
- Deactivate lead sources (hides from dropdown, preserves existing data).

### 22.4 Expense Category Management

Founder can:
- Add/edit/deactivate expense categories.

### 22.5 Notification Settings

Founder can:
- Configure reminder timing (e.g., session reminder 1 day vs 2 days before).
- Enable/disable email notifications globally.

### 22.6 System Settings

- Company name, logo, branding colors (for receipts and emails).
- Default currency (INR).
- Timezone (IST).

---

## 23. Data Entities

Summary of all primary entities and their relationships.

### 23.1 Entity List

| Entity | Key Relationships |
|--------|------------------|
| **User** (staff) | Has many assignments, tasks, expenses |
| **Client** | Has one plan enrollment, many sessions, payments, documents, assignments |
| **Plan** | Has many plan_services |
| **PlanService** | Belongs to plan |
| **ClientPlan** | Belongs to client + plan. Has many installments. |
| **Installment** | Belongs to client_plan. Has one proof document. |
| **Assignment** | Links client to staff with a role |
| **Session** | Belongs to client + consultant. Has rating, documents. |
| **FollowUp** | Belongs to client + CRO |
| **StylingOperation** | Belongs to client + session. Has checklist items. |
| **StylingChecklist** | Belongs to styling_operation |
| **Document** | Belongs to client. Linked from sessions, payments, expenses. |
| **Expense** | Belongs to submitter. Optionally linked to client. |
| **ExpenseCategory** | Has many expenses |
| **LeadSource** | Referenced by clients |
| **ContentItem** | Belongs to media team member |
| **Task** | Assigned to staff, optionally linked to client |
| **Notification** | Belongs to user or client |
| **ActivityLog** | Polymorphic log of all actions |

### 23.2 Entity Relationship Summary

```
User (staff)
 ├── assigns → Client (via Assignment)
 ├── submits → Expense
 ├── creates → Task
 ├── uploads → Document
 └── owns → ContentItem

Client
 ├── enrolled_in → Plan (via ClientPlan)
 │    └── has → Installment[]
 ├── has → Session[]
 │    └── each has → Rating, Document[]
 ├── has → Assignment[] (CRO, Coach, Consultants)
 ├── has → FollowUp[]
 ├── has → StylingOperation[]
 ├── has → Document[]
 └── came_from → LeadSource

Plan
 └── includes → PlanService[] (service type, sessions, timing rules)
```

### 23.3 Audit Trail

Every create, update, and delete operation on core entities is logged to the ActivityLog:

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | |
| entity_type | String | e.g., "client", "session", "payment" |
| entity_id | UUID | |
| action | Enum | `created`, `updated`, `deleted`, `status_changed` |
| performed_by | FK | User or Client who performed the action |
| changes | JSON | Before/after snapshot of changed fields |
| created_at | Timestamp | |

---

## 24. Business Rules & Edge Cases

### 24.1 Wedding Date Changes

- If a client changes their wedding date, all future scheduled sessions must be recalculated.
- Staff receives a notification: "Client X changed wedding date. Sessions have been rescheduled."
- Only future sessions (status = scheduled) are affected. Completed or cancelled sessions are untouched.
- Staff can manually adjust after auto-recalculation.

### 24.2 Client Pause (On Hold)

- All future session reminders are paused.
- CRO follow-ups are paused.
- Payment due dates are NOT automatically adjusted. CRO handles manually.
- When resumed (On Hold → Active), reminders resume. Staff may need to manually reschedule sessions.

### 24.3 Client Cancellation

- Reason for cancellation is recorded (dropdown + free text).
- All future sessions are cancelled.
- Outstanding installments are marked as `waived` by staff.
- Client can no longer log in to the portal.
- Client data is retained for reporting. Not deleted.

### 24.4 Consultant Reassignment

- If a consultant leaves or is reassigned, all their future sessions for that client transfer to the new consultant.
- Completed sessions retain the original consultant for historical accuracy.
- Assignment history is fully preserved.

### 24.5 Overlapping Sessions

- The system warns (but does not block) if a session is scheduled at a time when the client already has another session.
- The system warns if a consultant is double-booked on the same date.

### 24.6 Plan Changes Mid-Journey

- No mid-plan upgrades or downgrades in MVP.
- If a plan change is truly needed, the current plan is cancelled and a new enrollment is created. Payments already made are credited manually by staff.

### 24.7 Late Enrollment

- If a client enrolls with less time than the plan's start_offset_days, the system compresses the schedule (Section 7.3).
- A warning is shown: "This plan is designed for X days, but only Y days remain before the wedding."

### 24.8 Duplicate Clients

- System checks for existing clients by phone number and email before creating a new lead.
- If a match is found, CRO is warned and can choose to proceed or link to existing client.

---

## 25. Non-Functional Requirements

### 25.1 Performance

- Page load time: under 2 seconds.
- Dashboard data: cached, refreshed every 5 minutes or on demand.
- Search: results within 500ms.
- Supports 100+ concurrent staff users and 500+ concurrent client users.

### 25.2 Security

- All data in transit encrypted (HTTPS).
- Passwords hashed (bcrypt or equivalent).
- Role-based access enforced at API level, not just UI.
- Payment proofs and client photos stored in private cloud storage (not publicly accessible URLs).
- Session timeout after 30 minutes of inactivity.
- Invitation links are single-use and expire after 7 days.

### 25.3 Data Integrity

- Soft deletes only — no hard deletes of core entities.
- Full audit trail for all changes.
- Database backups daily.

### 25.4 Browser Support

- Chrome, Firefox, Safari, Edge — latest 2 versions.
- Responsive design for tablet (staff may use iPads).
- Client portal must be mobile-friendly (most clients will use phones).

### 25.5 Scalability

Initial target: up to 500 active clients, 50 staff users. Architecture should support 10x growth without major redesign.

---

## 26. Future Phase

Items explicitly deferred from MVP:

| Feature | Notes |
|---------|-------|
| Payment Gateway Integration | Razorpay/Cashfree — client pays directly in-app |
| WhatsApp Integration | Send reminders and follow-ups via WhatsApp |
| SMS Notifications | OTP login, payment reminders |
| Mobile Application | Native iOS/Android app for clients |
| AI Assistant | Chatbot for client queries, AI-generated progress reports |
| Advanced Analytics | Predictive churn, LTV estimation, demand forecasting |
| Workload Balancing | Auto-suggest consultant assignments based on capacity |
| Automated Scheduling | Auto-reschedule on conflicts, smart scheduling |
| Plan Upgrades/Downgrades | Mid-journey plan changes with prorated billing |
| Multi-Currency Support | If expanding beyond India |
| Client-to-Client Referral Tracking | Referral codes, incentive tracking |
| Video Consultation Integration | Built-in video calls (Zoom/Google Meet embed) |

---

## 27. Assumptions Log

Decisions made during planning that should be validated before development:

| # | Assumption | Status |
|---|-----------|--------|
| A1 | CROs handle both sales (lead conversion) and post-sale relationship management. There is no separate sales role. | Confirmed |
| A2 | The CRO who invites a client is automatically assigned as their CRO. | Confirmed |
| A3 | Operations Head assigns consultants, not the CRO. | Confirmed |
| A4 | Overdue payments trigger alerts but do NOT automatically block services. | Confirmed |
| A5 | Consultants are contractors, paid per session. Not salaried employees. | Confirmed |
| A6 | No mid-plan upgrades/downgrades in MVP. | Confirmed |
| A7 | Consultant marks session complete. Client's role is to rate afterward. | Confirmed |
| A8 | Client portal is mobile-responsive web, not a native app. | To Confirm |
| A9 | One client = one plan at a time. No concurrent plans. | Confirmed |
| A10 | GTB and Glow To Be share the same backend, staff, and consultants. Frontend branding differs based on client type. | Confirmed |
| A11 | Lead source options are admin-configurable (not hardcoded). | Confirmed |
| A12 | Assessment fields listed in Section 6.2 are the baseline. Founder may request additions. | To Confirm |
| A13 | Receipts are auto-generated PDFs, not manually uploaded. | To Confirm |
| A14 | Email is the external notification channel for MVP. WhatsApp/SMS are future phase. | To Confirm |

---

*End of SRS v2.0*

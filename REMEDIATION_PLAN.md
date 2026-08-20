# GTB OS — Remediation Plan & Findings Register

**Status:** Phase 0 (test harness) and Phase 1 (data-integrity & write-access) **DONE** as of this update. Every Phase 1 finding is closed and proven by the automated suite in `packages/db/tests/phase1-policies.test.ts` (48 tests, vitest, disposable Postgres). New same-class findings found during Phase 1: **SEC-18, SEC-19** (below). Phases 2–7 still open.
**Phase 2 (money & state integrity) also DONE** — STATE-1…STATE-7 closed, proven by `packages/db/tests/phase2-integrity.test.ts` (63 tests total, race semantics exercised with `Promise.allSettled` concurrent calls).
**Phase 3 (automation layer) also DONE** — SYS-1…SYS-4 closed, proven by `packages/db/tests/phase3-automation.test.ts` (71 tests total). SYS-2's external trigger (Vercel Cron / Supabase schedule) is deployment infra — the route (`/api/cron/daily`, `CRON_SECRET`-guarded) is the code part; owner picks the trigger.
**Phase 4 (data-loss & model integrity) also DONE** — DATA-1/2/3/5/6/7 closed; DATA-4 closed for the data-loss half, re-enrollment model deferred (see finding); DATA-8/9 documented as accepted.
**Phase 5 (wrong-data-shown metrics) also DONE** — CALC-1…12 + MISC-2/3/5/7/8/9 closed (all web-side; no runner exists for UI logic, verified by typecheck + code review; CALC-6/7/12 shared-predicate behavior is unit-testable in the future if a web test runner is added).
**Phase 6 (performance) DONE** — PERF-1/2 closed: server-side 45-day window on the dashboard sessions fetch, full-load gating on all seven dashboard queries, and take-based "Load more" pagination on Clients/Payments/Expenses/Documents/Follow-ups (50–100 rows/page). The dashboard aggregate endpoint and client search box remain as follow-ups (PERF notes below).
**Phase 7 (features) PARTIALLY DONE** — FEAT-1/3/5/8/9/10/12 implemented (see register); FEAT-2/4/6/7/11 deferred with reasons (below).
**Verification pass (2026-08-14) DONE** — a full re-audit of every closed finding surfaced 20+ gaps (same-class policy holes, an inverted CALC-10 fix, broken pagination semantics, cron day-boundary/idempotency defects, regressed DATA-5 indexes, an unwired FEAT-5). All fixed; see the **"Verification pass — findings register (V-*)"** section at the end of this document. Suite now 97 tests (`verification-pass.test.ts` added).

**Audience:** the engineer/model implementing the fixes. Read the whole "How to work" section before touching code.

**Verification note:** every `file:line` reference below was checked against the code as of this review (commit `93f62f4`). Line numbers drift as you edit — always re-open the file and confirm the code still matches the description before changing it. If it doesn't match, the issue may already be partially fixed; re-assess rather than blindly applying the "fix direction".

---

## 1. System context (read first)

- **Monorepo (pnpm workspaces):**
  - `apps/web` — React + Vite SPA. Talks to the backend two ways: (a) hand-written custom routes for privileged operations, (b) a generic ZenStack auto-CRUD gateway for everything else.
  - `apps/api` — Next.js (App Router) API. Contains `apps/api/src/app/api/model/[...path]/route.ts` (the generic ZenStack gateway) and 13 custom routes under `apps/api/src/app/api/**`.
  - `packages/db` — the data model + access policies live in `packages/db/schema.zmodel` (ZenStack, which compiles to Prisma). This single file is the security boundary for all gateway traffic.
  - `packages/shared` — enums, formatting (`format.ts`), scheduling math (`scheduling.ts`), permission helpers.
- **Auth:** Supabase issues the token; `apps/api/src/lib/auth.ts` `resolveAuthUser` resolves it to a `User` row, re-reading `role`/`isActive` from the DB on every request (fail-closed — good). ZenStack is handed a Prisma client "enhanced" with that identity, so `@@allow`/`@@deny` policies in `schema.zmodel` are what actually gate gateway requests.
- **The pivotal architectural fact:** the generic gateway (`model/[...path]/route.ts`) applies **row-level policies only**. It performs **no field-level filtering**. Multiple schema comments claim "the API whitelists fields" for self-updates — that whitelisting was never implemented anywhere. This single gap is the root cause of the most severe findings (SEC-1…SEC-5).

### SRS module → implementation map (for orientation)

All modules exist as real pages; `apps/web/src/components/PagePlaceholder.tsx` is dead code (rendered nowhere). Gaps are feature-completeness, not stubs. See Phase 7 for the missing pieces.

---

## 2. How to work (rules for the implementer)

1. **Correctness over speed. This app shows users real money and real client records — wrong data is worse than a missing feature.** Do not "fix" a symptom by hiding it; fix the cause.
2. **Verify before you change.** Re-read each cited location. Confirm the described bug still exists. If a fix would change externally visible behavior (an API contract, a status value, a stored field), note it.
3. **Work in the phase order below.** Phases are ordered by risk and dependency. Phase 1 (security) and Phase 2 (money integrity) gate everything else — do them first, in order. Do not batch unrelated phases into one PR.
4. **One coherent change per PR/commit**, with the finding IDs it closes in the message. Keep the diff reviewable.
5. **Schema changes require a migration.** Any `schema.zmodel` edit must be followed by regenerating the ZenStack/Prisma client and creating a migration. Unique constraints that back a race fix (Phase 2) are not optional — the application-level guard and the DB constraint work together.
6. **Prove each fix.** For a security fix, write down the exact request that used to exploit it and confirm it now returns 403. For a race fix, describe the concurrent sequence and why the constraint/transaction now prevents it. Add tests where the harness allows; if there's no test runner wired up, add one (Phase 0) — a money system with zero tests is itself a finding.
7. **Do not trust this document as exhaustive.** It is thorough but human/agent-generated. You are explicitly authorized and expected to use your own analysis to find related issues — especially more instances of the *same class* of bug (other unrestricted `@@allow('update'/'create')` field exposures, other non-atomic multi-write routes, other whole-table fetches, other derived-metric inconsistencies). When you find one, add it to this register with a new ID and fix it in the matching phase.
8. **Preserve the good parts.** `clients/assign` (transaction + assignment history), the scheduling math in `scheduling.ts`, server-side price snapshotting on enroll, private-bucket + signed-URL storage, and `en-IN` currency formatting are all correct. Match those patterns; don't regress them.

---

## 3. Findings register

Severity: **CRITICAL** (exploitable now, data/financial/security impact) · **HIGH** (serious correctness or data-loss) · **MEDIUM** (wrong behavior users will hit) · **LOW** (polish, edge cases).

Each finding: what's wrong → concrete failure/exploit → fix direction → acceptance criteria.

---

### Phase 1 — Data-integrity & write-access correctness (CRITICAL). The generic gateway enforces *rows* but not *fields*.

> **Framing:** these are not abstract "security" concerns — they are the app showing **wrong data**. Because the gateway lets a client write any field of a row they own, a client can set their own installment to `approved`, and staff dashboards, revenue reports, and payment totals will then display money that was never collected. Fixing this is fixing the foundation of what every screen shows.
>
> **Root cause for SEC-1…SEC-6, SEC-17.** Fix strategy (pick one, apply consistently):
> **(A)** Add ZenStack **field-level** policies so a caller can only write the fields they're permitted to (see the *ZenStack field-level policy mechanics* appendix at the end of this document for exact syntax — this is fully supported and is the intended tool here). **(B)** Stop exposing the sensitive models (`User`, `Installment`, `Client`, `Session`, `Expense`, `Document`) through the generic gateway for writes, and route those mutations through hardened custom endpoints that whitelist fields explicitly (like the existing custom routes do). Recommended: **(A)** for narrow self-service fields (client attaching a proof, editing their own profile, leaving a rating), **(B)** for anything a client should never touch. Whichever you choose, the acceptance test is the same: the offending request must be rejected or the disallowed field dropped, verified by re-reading the row.

**SEC-1 · CRITICAL · Privilege escalation to founder.**
`packages/db/schema.zmodel:262` — `@@allow('update', auth().role == founder || auth().id == id)` on `User`, with no field-level guard on `role`, `isActive`, `email`, `authId`.
*Exploit:* any authenticated user (client, consultant, media) sends an `update` to the gateway on **their own** `User` row with `{ role: "founder" }`. Row policy passes (`auth().id == id`). `resolveAuthUser` re-reads role from the DB next request → attacker is founder (full control: users, plans, deletes, all client data). Same vector reactivates a deactivated account (`isActive: true`) or hijacks the row's `authId`/`email`.
*Fix direction:* deny self-writes to `role`, `isActive`, `authId`, `email`; allow self-update of only `name`, `phone`, `avatarUrl`. Privileged fields writable by founder only.
*Acceptance:* a non-founder `update` setting `role`/`isActive` on their own row is rejected (or the field is silently dropped and re-reads unchanged).
**✅ CLOSED (Phase 1).** Field-level denies on `role`/`isActive`/`email` + a model-level `@@deny('update', …, future().authId != authId)` (ZenStack's field-level denies don't reliably fire on nullable fields — see the runtime-constraints note at the end of Phase 1). Proved: `client` self-update `{role:"founder"}` → P2004 denied, row re-reads `role=client`; deactivated self-reactivation denied; `authId`/`email` writes denied; benign `name`/`phone` self-update still works; founder still edits roles. Tests: "Phase 1 — SEC-1".

**SEC-2 · CRITICAL · Clients self-approve their own payments.**
`schema.zmodel:474` — `@@allow('update', clientPlan.client.userId == auth().id)` on `Installment`, no field-level restriction (comment at :471-472 claims one exists; it does not).
*Exploit:* a client updates their own installment `{ status: "approved", approvedById: <self>, approvedAt: <now>, amount: 1 }`. Row policy passes on ownership. The installment ledger — the source of truth for "paid" — is now attacker-controlled. Staff payment dashboards, "paid" totals, overdue alerts all believe it. (Lead→Converted still needs the custom approve route, but the money ledger is forged.)
*Fix direction:* client may transition status only `pending|overdue|rejected → proof_submitted` and set only `proofDocumentId`. Deny client writes to `status ∈ {approved, waived}`, `approvedById`, `approvedAt`, `paymentMethod`, `amount`. Consider moving proof submission to a dedicated server route (see also STATE-6).
*Acceptance:* a client `update` setting `status:"approved"` on their own installment is rejected.
**✅ CLOSED (Phase 1).** Model-level client rule: `clientPlan.client.userId == auth().id && (future().status == status || (future().status == proof_submitted && status != approved && status != waived))` + field denies on the ledger fields (`amount`, `approvedById`, `approvedAt`, `paymentMethod`, `dueDate`, `installmentNumber`, `clientPlanId`, `notes`, `rejectionReason`). Proved: `{status:"approved", approvedById:self}` → denied, row re-reads `pending`; `amount:1` denied; proof-submission write (`proof_submitted` + `proofDocumentId`) works; `approved → proof_submitted` regression denied; CRO approval still works. Tests: "Phase 1 — SEC-2".

**SEC-3 · CRITICAL · Clients rewrite their own lifecycle/status.**
`schema.zmodel:320` — `@@allow('update', userId == auth().id)` on `Client`, no field whitelist.
*Exploit:* a client sets their own `status: "active"`/`"converted"`, `leadPhase`, `conversionDate`, `weddingDate`, `clientCode` (unique — can grief collisions), `type`, `notes`, `cancellationReason`. Setting `status != "lead"` bypasses onboarding gating and makes them appear converted with no payment, poisoning dashboards, funnels, and reports.
*Fix direction:* whitelist client-writable fields to `name`, `phone`, `avatarUrl`, and the specific forward-only `leadPhase` transitions the onboarding wizard legitimately needs (`registered → assessment_completed → plan_selected → payment_submitted`, never backward, never to `status`). Everything else founder/ops/assigned-CRO only.
*Acceptance:* client cannot change their own `status`, `clientCode`, `conversionDate`, or regress `leadPhase`.
**✅ CLOSED (Phase 1).** Client self-path `@@allow('update')` now requires `future().leadPhase == leadPhase || <any strictly-forward leadPhase transition>`; field denies on `status`, `clientCode`, `conversionDate`, `convertedById`, `leadSourceId`, `type`, `weddingDate`, `email`, `city`, `notes`, `cancellationReason`, `onHoldReason`, `userId`. Note: the plan mentions an `assessment_completed` phase — that value does not exist in the `LeadPhase` enum (SRS §5.3 agrees); the wizard's real transitions are `registered → plan_selected → payment_submitted`. Proved: `status:"active"` denied; `clientCode`/`conversionDate`/`weddingDate`/`email`/`city`/`type` denied; forward transitions allowed, `payment_submitted → registered` regression denied; profile edits work; assigned coach can still set `on_hold`. Tests: "Phase 1 — SEC-3".

**SEC-4 · HIGH · Clients complete/edit their own sessions.**
`schema.zmodel:543` — `@@allow('update', client.userId == auth().id)` on `Session`, comment claims "rating only"; not enforced.
*Exploit:* a client sets their own future session `status: "completed"` (inflates progress ring; corrupts staff views and the payout signal), edits `scheduledDate`, `notes` (the consultant's notes), `consultantId`, or `rating` to an out-of-range value (the `Int` has no 1–5 bound).
*Fix direction:* client may write only `rating` (validate 1–5) and `ratingFeedback`, and only when `status == "completed"`. All other session mutation is consultant/admin via the existing custom routes.
*Acceptance:* client cannot set `status`/`scheduledDate`/`notes`; `rating` outside 1–5 rejected.
**✅ CLOSED (Phase 1), with a documented deviation.** ZenStack 2.22 cannot express the client-path restriction on Session without breaking the model (see runtime-constraints note at the end of Phase 1): field-level denies on `status` and pre-state `status` references in update rules both deny **every** Session update, including founder/consultant writes. Strategy (B) applied: client Session writes are **not exposed on the gateway at all**; rating goes through the new server route `apps/api/src/app/api/sessions/rate/route.ts` (logic in `packages/db/src/server/sessionRating.ts`), which validates ownership, `status == completed`, and an integer 1–5 — backed by the `Session_rating_range` CHECK constraint in the Phase 1 migration. Web `PortalSessions` now calls `rateSession()` instead of the gateway hook. Proved: gateway client `status:"completed"`/`scheduledDate`/`notes`/`rating` writes all denied; route accepts 1–5 on owned completed sessions; rejects 0/6/2.5/NaN (400), non-completed (409), foreign sessions (403), missing (404); consultant gateway completion still works. Tests: "Phase 1 — SEC-4" + "Phase 1 — SEC-4 route".

**SEC-5 · HIGH · Any authenticated user creates Document rows for any client.**
`schema.zmodel:650` — `@@allow('create', auth() != null)` on `Document`, no ownership predicate. Combined with `documents/signed-url/route.ts` authorizing on the *row's* `clientId` then signing whatever `fileUrl` the row holds.
*Exploit:* client A creates a `Document` with `clientId=<own>` but `fileUrl="<clientB-id>/payment_proof/<uuid>-file.jpg"`, then calls signed-url and receives a link to client B's file. Also lets anyone spam malicious filenames into other clients' document lists, or forge a `payment_proof`/`payment_receipt` document.
*Fix direction:* restrict `create` to admins, actively-assigned staff, or the owning client; and **deny `fileUrl` on gateway creates entirely** — only the `documents/upload` route (which validates ownership and builds a traversal-safe key) should ever set `fileUrl`. Enforce a type-by-role allowlist per SRS §16.1 (client cannot create `payment_receipt`, `consultation_notes`, `skincare_plan`, etc.).
*Acceptance:* a client `create` on `document` with a foreign `fileUrl` is rejected; signed-url never mints a URL for a path the row's client doesn't own.
**✅ CLOSED (Phase 1).** Gateway Document `create` is removed entirely (no UI flow uses it — every creation path is the server `documents/upload` route, which now also enforces the §16.1 type-by-role allowlist, validates `sessionId` against the client, sniffs magic bytes and limits MIME to the SRS §16.2 list — see SEC-12). Delete is founder/ops-only. Proved: gateway `document.create` with a forged `fileUrl` → denied; client delete denied, ops delete allowed. Tests: "Phase 1 — SEC-5".

**SEC-6 · HIGH · Any staff creates a pre-approved Expense payable to themselves.**
`schema.zmodel:718` — broad `create` for all staff roles; update is correctly restricted (`:719-721`) but create has no field guard.
*Exploit:* a consultant/CRO POSTs an expense `{ status: "approved", approvedById: <self>, approvedAt: <now>, amount: 500000, payeeId: <self> }`. The "expense approval = founder/ops only" boundary (SRS §3.2) is bypassed at create time. `submittedById` can also be spoofed to another user.
*Fix direction:* on create for non-admins, force `status = "submitted"`, force `submittedById = auth().id`, deny `approvedById`/`approvedAt`.
*Acceptance:* a non-admin cannot create an expense with `status:"approved"`.
**✅ CLOSED (Phase 1).** `@@deny('create', role != founder/ops && (status != submitted || submittedById != auth().id || approvedById != null || approvedAt != null))` + field denies so a non-admin submitter can't self-approve their own draft via the update path either (that hole is registered as **SEC-18**). Proved: non-admin `status:"approved"` create denied; spoofed `submittedById` denied; legit submitted create works; submitter self-approval via update denied; ops approval works. Tests: "Phase 1 — SEC-6".

**SEC-7 · HIGH · Email-based account linking can be pre-empted (account takeover).**
`apps/api/src/lib/auth.ts:41-54` — first Supabase login whose email matches a `User` row with `authId == null` silently claims that row, with no `email_confirmed_at` check and no invite-token binding. Invited-but-not-yet-registered staff (incl. founder/ops) and clients have exactly this shape (`staff/invite` and `clients/invite` create `authId: null` rows).
*Exploit (conditional on Supabase settings):* if public sign-up is enabled and/or email confirmation is off, an attacker who knows an invitee's email registers it first and inherits the privileged pre-provisioned row.
*Fix direction:* require `data.user.email_confirmed_at` before linking; bind linking to a one-time invite nonce rather than raw email equality; disable public sign-ups in the Supabase project (invite/magic-link only). Verify the Supabase project settings as part of this.
*Acceptance:* an unconfirmed or non-invited email cannot claim an existing `User` row.
**✅ CLOSED in code (Phase 1), owner action still required.** `auth.ts` now refuses to link until `data.user.email_confirmed_at` is set. A one-time invite nonce would change the invite flow contract and is deferred (documented in the plan). **Owner must verify the Supabase project: public sign-up disabled, email confirmation required** — that setting is not enforceable from this codebase (Supabase dashboard → Authentication → Providers / Sign In settings).

**SEC-8 · HIGH · Client-invite can link a client record to a staff account.**
`apps/api/src/app/api/clients/invite/route.ts:52-59` — `user.findUnique({ where: { email } })` reuses **any** existing user regardless of role; the mirror `staff/invite` route guards against client emails, this one has no guard.
*Exploit:* inviting a lead whose email matches an existing staff user sets `Client.userId` to the staff user's id; that staffer then passes every `client.userId === authUser.id` ownership check (enroll/upload/signed-url), and the client's login links to a staff-role row.
*Fix direction:* reject (or require explicit confirmation) when a matched existing user's `role !== "client"`.
*Acceptance:* inviting an email that belongs to a staff user does not silently link.
**✅ CLOSED (Phase 1).** `clients/invite` returns 409 when the matched user's role is not `client`.

**SEC-9 · HIGH · Login-capable magic links returned in API responses.**
`apps/api/src/app/api/clients/invite/route.ts:99-125` and `staff/invite/route.ts:62-69` — on re-invite the route generates a `magiclink` and returns `action_link` in the JSON "so the UI can copy it". A magic link authenticates **as that user** with no password.
*Exploit:* any CRO can obtain and use a client's magic link to enter their portal session; the founder can do the same to any staff member.
*Fix direction:* deliver magic/recovery links only by email. Return the link in the API response only when mail is unconfigured (dev fallback), never in normal operation; prefer a non-authenticating "set your password" invite flow.
*Acceptance:* a normal (mail-configured) invite response contains no usable auth link.
**✅ CLOSED (Phase 1).** Both invite routes now return `registrationUrl` only when `!mailConfigured` (dev fallback); the web UIs (`InviteClientPanel`, `UsersSettings`) render/copy the link only when present.

**SEC-10 · MEDIUM · Document visibility too coarse for staff.**
`documents/signed-url/route.ts:48-53` — any actively-assigned staffer can sign a URL for **any** doc type; only `consultation_notes` is carved out (and only vs the client).
*Exploit:* an assigned fitness trainer or coach can fetch a client's `payment_proof` bank screenshots. SRS §16.1 restricts payment proofs to CRO/Ops/Founder.
*Fix direction:* per-type visibility matrix keyed on role (mirror SRS §16.1). Apply the same matrix to the `Document` read policy in the schema.
*Acceptance:* a non-finance assigned staffer cannot sign a `payment_proof` URL.
**✅ CLOSED (Phase 1).** Schema read policy + signed-url route both apply the §16.1 matrix: assigned staff see all docs except `payment_proof` (CRO/Ops/Founder only) and `expense_receipt` (Ops/Founder only); clients see own docs except `consultation_notes`. Proved for reads (coach sees neither financial type, CRO sees `payment_proof`, ops sees both, coach still sees `skincare_plan`, client never sees `consultation_notes`); the signed-url route mirrors the same checks. Tests: "Phase 1 — SEC-10".

**SEC-11 · MEDIUM · Staff PII (email, phone) readable by every client.**
`schema.zmodel:257` — broad staff-read grant with no field omission; every authenticated user (incl. clients) can read all staff `email`/`phone`.
*Fix direction:* field-level omit `email`/`phone` from the broad read grant, or expose a narrowed staff-directory projection for assignment pickers.
*Acceptance:* a client reading the User list receives no `email`/`phone` values.
**✅ CLOSED (Phase 1).** `@deny('read', <role != client>)` on `User.email`/`User.phone` (expressed as the exhaustive staff-role list — the bare `client` literal collides with the `client` relation in `User` scope). Proved: client `findMany User` returns rows without `email`/`phone`; staff reads still include them. All staff-directory queries in the web app are staff-only. Tests: "Phase 1 — SEC-11".

**SEC-12 · MEDIUM · Uploader-role not restricted on document type; `sessionId` unvalidated.**
`documents/upload/route.ts:57-116` — any authorized party can upload any `DocumentType` (a client can upload a system-only `payment_receipt` or a consultant-only `consultation_notes`), and `sessionId` is written unvalidated (wrong id → FK 500; another client's session id → cross-client linkage). DOCX is rejected despite SRS §16.2 (`ALLOWED_MIME` at `:12-18` omits the DOCX mime and adds webp/heic the SRS doesn't list); MIME is trusted from `file.type` with no magic-byte check.
*Fix direction:* type-by-role allowlist per §16.1; verify `sessionId` belongs to `clientId`; add the DOCX mime and drop unlisted types (or intentionally document the deviation); sniff magic bytes.
*Acceptance:* a client cannot upload `payment_receipt`/`consultation_notes`; a `sessionId` of another client is rejected; DOCX uploads work; a renamed-binary upload is rejected.
**✅ CLOSED (Phase 1).** Type-by-role allowlist per §16.1 (`payment_proof` = owner+admins, `expense_receipt` = any staff, `consultation_notes`/plan docs = the owning consultant role, `client_photo` = client or staff, `assessment_form`/`payment_receipt` = system-only); `sessionId` must resolve to a session of the same client; MIME set is exactly JPEG/PNG/PDF/DOCX (webp/heic dropped per SRS §16.2); magic-byte sniffing rejects content that doesn't match the declared type.

**SEC-13 · MEDIUM · CORS reflects any localhost with credentials; weak prod fallback.**
`apps/api/src/lib/cors.ts:6-10` reflects any localhost origin with `Allow-Credentials: true`; prod fallback `env.webOrigin[0] ?? "*"` and `env.ts:6-13` does not throw when `WEB_ORIGIN` is unset. Low practical impact (bearer-token auth, not cookies) but tighten: strict allowlist, never `*` with credentials, validate `WEB_ORIGIN` at boot in production.
*Acceptance:* an unlisted origin is never reflected; production boot without `WEB_ORIGIN` fails loudly.
**✅ CLOSED (Phase 1).** `cors.ts` no longer falls back to `*` and only reflects allowlisted origins (dev-localhost stays for Vite); `env.ts` throws in production when `WEB_ORIGIN` is unset.

**SEC-14 · LOW · Plan read policy exposes inactive plans/other client-type pricing to clients** (`schema.zmodel:406` `auth() != null`). Scope client reads to `isActive` if pricing is sensitive.
*Acceptance:* clients cannot read inactive plans; staff still can.
**✅ CLOSED (Phase 1).** `@@allow('read', auth() != null && (auth().role != client || isActive))`. Proved: client `findMany Plan` returns only the active plan; founder sees both. Tests: "Phase 1 — SEC-14".

**SEC-15 · LOW · HTML injection in transactional emails.**
`apps/api/src/lib/emails.ts:39,74` — `clientName`/`staffName` interpolated into HTML unescaped. Escape all interpolations.
*Acceptance:* user-provided names/URLs cannot inject markup into the email HTML.
**✅ CLOSED (Phase 1).** All user/URL interpolations in `emails.ts` now pass through an `esc()` HTML escaper (both invite templates, hrefs included).

**SEC-16 · LOW · FollowUp create trusts `clientId`** (`schema.zmodel:572`) — a CRO must set `croId` to self (low risk) but nothing enforces the `clientId` is one they're assigned to.
*Acceptance:* a CRO cannot create a follow-up for a client they aren't actively assigned to.
**✅ CLOSED (Phase 1).** CRO create path now requires `croId == auth().id && client.assignments?[staffId == auth().id && isActive && role == cro]`. Proved: unassigned create denied, assigned create works. Tests: "Phase 1 — SEC-16".

**SEC-17 · LOW · Assessment self-create/update has no field guard.**
`schema.zmodel:369` lets the owning client create/update their own `Assessment` with no field restriction, and `:370` lets any assigned consultant update it. Low impact (it's the client's own assessment) but same class as SEC-1…6: a client can set `completedAt` themselves (which the onboarding state machine keys off), or a fitness trainer can overwrite the skincare consultant's `dermatologicalNotes`. Fold into the Phase-1 field-policy pass: gate `completedAt` to the server/onboarding flow, and scope consultant writes to their own service's fields.
*Acceptance:* a fitness trainer cannot overwrite skincare fields; the client wizard upsert (including `completedAt`) still works.
**✅ CLOSED (Phase 1), with one documented decision.** Every Assessment field now carries an `@allow('update')` scoping rule: the owning client + admins may write everything; `skincare_*`/`allergies`/`dermatologicalNotes` are additionally skincare-consultant-only, fitness fields fitness-trainer-only, styling fields styling-consultant-only; `completedAt` is client/admin-only (the onboarding wizard writes it — this IS the "server/onboarding flow" per SRS §6, so it stays client-writable; there is no other writer today). `id`/`clientId` are immutable. Proved: trainer overwriting `dermatologicalNotes` denied (row unchanged), trainer writing `fitnessLevel` allowed, wizard upsert with `completedAt` works, assessment can't be moved to another client. Tests: "Phase 1 — SEC-17".

---

### New findings discovered during Phase 1 (same classes as above)

**SEC-18 · HIGH · Submitter can self-approve their own expense via the gateway update path.**
`schema.zmodel` Expense `@@allow('update', submittedById == auth().id && status == submitted)` — the `status == submitted` clause is a *pre-update* check, so a submitter updating `{ status: "approved", approvedById: <self>, approvedAt: <now> }` on their own still-`submitted` expense sails through the model-level rule. Same money-integrity class as SEC-6, via `update` instead of `create`.
*Fix:* field-level denies on `status`/`approvedById`/`approvedAt` for the non-admin submitter path; admins unaffected.
*Acceptance:* a non-admin cannot approve their own draft expense via gateway update.
**✅ CLOSED (Phase 1).** Proved: submitter `{status:"approved", approvedById:self}` → denied, row re-reads `submitted`; ops-head approval still works. Tests: "Phase 1 — SEC-6".

**SEC-19 · LOW · Gateway lets callers rewrite record `id`s.**
Prisma `update` accepts `id` in `data`; through the gateway a client could change the PK of their own `Client`/`Session`/`Installment`/`User` rows (breaks FK relations and ownership links — self-DoS and data-corruption vectors of the same class as SEC-1…6).
*Fix:* `@deny('update', true)` on `id` for User, Client, Assessment, Installment, Session, Expense (no legitimate flow ever writes an id).
*Acceptance:* `update({ data: { id } })` is denied on those models.
**✅ CLOSED (Phase 1).** Proved: session id rewrite denied; client `userId` unlink denied (the `userId` self-deny also covers the auth-link row). Tests: "Phase 1 — record-id immutability".

**ZenStack 2.22 runtime constraints discovered during Phase 1 (documented for future phases):**
1. **Field-level `@deny('update', …)` on the Session `status` field breaks EVERY Session update** (any caller, any field — even founder writes of `notes` fail). Bisected in a scratch suite; worked around with strategy (B) (no client path on the gateway; `sessions/rate` route).
2. **Field-level update denies don't reliably fire on nullable fields** (verified on `User.authId String?`; non-nullable `role`/`isActive`/`email` do fire). Use a model-level `future()` deny for nullable fields.
3. **Referencing a field's pre-update value in an update rule breaks updates that WRITE that field** on the same model (Session `status` case), so "already-completed" constraints cannot be expressed per-field for Session. Prefer strategy (B) (server route) wherever a post-state/field comparison is required on a model whose status field is staff-written.

These were verified empirically against `zenstack@2.22.3` (resolved from `^2.11.4`). Any future Phase-1-style field-policy work must re-verify against the pinned version.

---

### Phase 2 — Money & state integrity (HIGH). Non-atomic multi-write flows + missing DB constraints.

> **Root cause for STATE-1…STATE-4.** These routes do read → check → write as separate statements with no transaction and no conditional update, and the tables lack the unique constraints that would make a duplicate impossible. Under a double-click or two concurrent users, they duplicate money records or lose state. **Fix pattern (apply to each):** wrap the sequence in `prisma.$transaction`; replace read-then-write with a conditional `updateMany({ where: { id, status: <expected> } })` and check the returned `count`; add the missing `@@unique` constraint so the DB is the final backstop. `clients/assign/route.ts:64` already demonstrates the transaction pattern — follow it.

**STATE-1 · HIGH · Payment approval is non-atomic and race-prone.**
**✅ CLOSED (Phase 2).** Core logic extracted to `approveInstallment` (`packages/db/src/server/paymentApproval.ts`), called by `payments/approve`: one transaction, conditional `updateMany({ where: { id, status: { notIn: [approved, waived] } } })` (count !== 1 → `PaymentConflictError` → 409), the first-approval decision derived from a fresh in-tx count, and the Lead→Converted flip is itself a conditional `updateMany({ where: { id, status: "lead" } })` so concurrent approvals of different installments can't double-convert. Proved: concurrent double-approve → exactly one success + one `PaymentConflictError`, exactly one conversion; concurrent approvals of two installments → both approved (both are real payments) but exactly one conversion; a later installment approves without re-converting; crash-consistency is inherent (one tx). Tests: "Phase 2 — STATE-1".

`apps/api/src/app/api/payments/approve/route.ts:38-106` — three separate writes, read-then-write checks, no transaction.
*Failures:* (a) two concurrent approvals of the same installment both pass the `status==="approved"` check and both write (approver/notes overwritten, duplicate notifications); (b) concurrent approvals of two different installments both compute `priorApproved===0` and both run the Lead→Converted branch (double conversion, double admin notifications); (c) if the process dies between the installment update (`:79`) and `client.update` (`:92`), the installment is approved but the client is never converted — and the conversion is **permanently lost** because every later approval sees `priorApproved>0` and sets `isFirstApproval=false`.
*Fix:* transaction; `updateMany({ where: { id, status: { notIn: ["approved","waived"] } } })` and require `count===1`; derive the "is this the first approval → convert" decision **inside** the transaction from a fresh count.
*Acceptance:* concurrent double-approve results in exactly one approval and one conversion; a mid-flight crash leaves a consistent state (either fully applied or fully not).

**STATE-2 · HIGH · Duplicate session-schedule generation on concurrent activation.**
**✅ CLOSED (Phase 2).** `@@unique([clientId, serviceType, sessionNumber])` added to `Session`; `activateClientPlan` (`packages/db/src/server/clientActivation.ts`) does schedule + status flip + follow-up seeding in ONE transaction with `createMany({ skipDuplicates: true })`. Proved: two concurrent activations → both succeed, exactly 5 sessions (2 skincare + 3 fitness, not 10), client active once, exactly 2 follow-ups. Tests: "Phase 2 — STATE-2".

`apps/api/src/app/api/clients/activate/route.ts:72-100` — idempotency guard is `_count.sessions === 0` read outside any transaction; `Session` has no unique constraint on `(clientId, serviceType, sessionNumber)`.
*Failure:* two concurrent activate calls (double-click "Activate") both see 0 sessions and both `createMany` → a fully duplicated schedule, and each duplicate later spawns its own consultant-fee expense (real money).
*Fix:* add `@@unique([clientId, serviceType, sessionNumber])` to `Session`; wrap activation in a transaction; use `createMany({ skipDuplicates: true })` against that constraint (or check `count` on a conditional client status flip guarding activation).
*Acceptance:* double-activate produces exactly one schedule.

**STATE-3 · MEDIUM · Duplicate consultant-fee expense on concurrent session completion.**
**✅ CLOSED (Phase 2).** Partial unique index `Expense_sessionId_key ON Expense(sessionId) WHERE sessionId IS NOT NULL`; `completeSession` (`packages/db/src/server/sessionCompletion.ts`) does status flip + payout expense in one transaction with a conditional `updateMany({ where: { id, status: { notIn: [completed, cancelled] } } })` guard. Proved: concurrent double-complete → one success + one `SessionConflictError`, exactly one expense, session completed once. Tests: "Phase 2 — STATE-3".

`apps/api/src/app/api/sessions/complete/route.ts:45-92` — status check then update then `expense.create`, no transaction, and `Expense.sessionId` has no unique constraint.
*Failure:* two concurrent completes → two payable consultant-fee expenses for one session (money leakage).
*Fix:* add a unique constraint scoping one consultant-fee expense per `sessionId` (partial/conditional if `sessionId` is reused for other expense kinds); `session.updateMany` with a status guard; do both writes in a transaction.
*Acceptance:* double-complete produces one session completion and one expense.

**STATE-4 · MEDIUM · Missing uniqueness constraints (data-integrity backstops).**
**✅ CLOSED (Phase 2).** Migration `20260812060000_phase2_money_state_integrity` adds: `Installment @@unique([clientPlanId, installmentNumber])`, `Session @@unique([clientId, serviceType, sessionNumber])`, partial unique `Expense(sessionId) WHERE sessionId IS NOT NULL`, partial unique `Assignment(clientId, role) WHERE isActive`. `clients/assign` now maps the assignment-index P2002 → 409. Proved: duplicate rows in all four shapes are rejected at the DB layer; a deactivated assignment frees its slot. Tests: "Phase 2 — STATE-4".

`Installment`: add `@@unique([clientPlanId, installmentNumber])` (`schema.zmodel:444`). `Assignment`: SRS §14.2 "exactly one active staff per role per client" is app-enforced only — a race in `clients/assign` can create two active CROs; add a partial unique index (`[clientId, role]` where `isActive`) via a raw migration. (Session/Expense covered by STATE-2/3.)

**STATE-5 · MEDIUM · Invalid/unbounded `actualDate` on session completion.**
**✅ CLOSED (Phase 2).** `sessions/complete` rejects unparseable dates (NaN) and future dates (>24h ahead) with 400, mirroring the reschedule check. The completion + the expense it dates are one transaction, so the bound applies to both.

`sessions/complete/route.ts:52` — `new Date(body.actualDate)` is never NaN-checked (reschedule checks at `:32`). `{"actualDate":"garbage"}` → Invalid Date → unhandled 500; also no bounds check, so a completion (and the expense it dates) can be years off.
*Fix:* mirror the reschedule NaN check and add sane bounds.

**STATE-6 · MEDIUM · Non-atomic two-step client-side mutations desync wizard vs guard.**
**✅ CLOSED (Phase 2).** New server route `payments/submit-proof` (`submitPaymentProof` in `packages/db/src/server/proofSubmission.ts`): installment → proof_submitted and client → leadPhase: payment_submitted advance in ONE transaction. Also validates the proof document belongs to the client (same class as SEC-2) and rejects double-submits with a guarded update. `PaymentStep` and `PortalPayments` now call the route instead of two gateway calls — the wizard can no longer show "all set" while the gate bounces back. Tests: "Phase 2 — STATE-6".

`apps/web/src/pages/portal/onboarding/PaymentStep.tsx:45-54` and `PortalPayments.tsx:69-82` — installment→`proof_submitted` and client→`leadPhase:payment_submitted` are two separate requests. If the second fails, the wizard computes `done` but `RequireOnboarded` still sees `leadPhase < payment_submitted` → the client is stuck on a "You're all set" screen with a button that bounces back.
*Fix:* advance `leadPhase` server-side as part of proof submission (a `payments/submit-proof` route, or a ZenStack post-update hook), so the two writes are atomic. This also composes with SEC-2's move of proof submission server-side.

**STATE-7 · LOW · Double-enroll race surfaces as 500 not 409.**
**✅ CLOSED (Phase 2).** `enrollClientInPlan` (`packages/db/src/server/clientEnrollment.ts`) wraps ClientPlan+installments+leadPhase in one transaction and maps P2002 → `EnrollmentConflictError` → 409; the leadPhase update can no longer be orphaned by a crash. Tests: "Phase 2 — STATE-7".

`clients/enroll/route.ts:51-91` — the check-then-create race is ultimately caught by `ClientPlan.clientId @unique`, but the P2002 is unhandled (`:30 catch {}` is generic) → 500; and the `leadPhase` update (`:93-98`) is outside the create, so a crash leaves phase stale. Handle P2002 → 409; move the phase update inside the transaction. (See DATA-4 about the `@unique` itself.)

---

### Phase 3 — The dormant "system does it automatically" layer (HIGH).

**SYS-1 · HIGH · ActivityLog has zero writers.**
**✅ CLOSED (Phase 3).** `logActivity(tx, …)` helper in `packages/db/src/server/activityLog.ts`, called INSIDE the same transaction from: payment approve (installment + conversion), proof submit, reject, session complete, reschedule (with before/after dates — see DATA-2), activate, enroll, cancel/complete cascades. The dashboard "Recent activity" feed stays synthesized from real source rows (sessions/payments/follow-ups/styling) — it already renders the same facts; the ActivityLog is the durable §23.3 audit trail (and the reschedule history store). Proved: approval writes installment + conversion audit rows; reschedule writes one row. Tests: "Phase 3 — SYS-1" / "Phase 3 — DATA-2".

`schema.zmodel:805-822` defines the model (read-only policy, server-writes-only — correct), but **no code creates rows** (verified: `grep activityLog apps/api/src` → nothing). SRS §23.3 requires logging every create/update/status-change; §9.4's reschedule history and the dashboard "Recent Activity" feed both depend on it and are empty.
*Fix:* a server-side `logActivity(tx, {...})` helper invoked (inside the same transaction) from every privileged mutation: approve, reject, complete, reschedule, activate, assign, status changes, enroll. Backfill the dashboard feed to read it.
*Acceptance:* approving a payment writes an ActivityLog row; the dashboard feed renders it.

**SYS-2 · HIGH · No scheduler → all time-based automation is inert.**
**✅ CLOSED (Phase 3), one deployment action remains.** New `runDailyJobs()` (`packages/db/src/server/cronJobs.ts`) + `GET /api/cron/daily` guarded by an `x-cron-secret` header (env `CRON_SECRET`). Jobs: overdue installment flips (pending → overdue, SRS §8.6 — the **stored** source of truth, per DATA-6), overdue follow-up flips, session reminders (1 day before), payment-reminder follow-ups (due-in-3-days / due-today, guarded against duplicates), satisfaction-check follow-ups after every 3rd completed session, styling-in-7-days and task-overdue notifications. Every notification/follow-up creation is idempotent per day. **Owner action:** schedule the route daily (Vercel Cron, GitHub Actions, or Supabase scheduled function — deployment detail). Proved: overdue flips, reminder creation + double-fire idempotency, satisfaction-check cadence. Tests: "Phase 3 — SYS-2".

No cron/job anywhere in `apps/api` (verified). Consequently **none** of these ever fire: session reminders (SRS §9.3, "1 day before"), payment-due reminders (§12.1, "3 days before + on due date"), overdue-installment/overdue-follow-up status flips, task-overdue and styling-in-7-days notifications (§18), satisfaction-check follow-ups after every 3rd session (§12.1), and "not contacted 7+ days" surfacing. Overdue-ness is only *derived in the browser* (`apps/web/src/lib/insights.ts:28-40`), so the stored status stays `pending` and any server-side consumer, report, or notification sees the wrong state.
*Fix:* introduce a scheduled worker (a cron route hit by an external scheduler, a Supabase scheduled function, or a small node cron process — pick per deployment). Jobs: flip overdue installments/follow-ups; emit due/overdue/reminder notifications; generate payment-reminder and satisfaction-check follow-ups anchored to due dates / session counts. Decide one source of truth for "overdue" (stored *or* derived) and make the UI and jobs agree — don't keep both half-alive.
*Acceptance:* a session scheduled for tomorrow produces a reminder notification; an installment past its due date shows `overdue` consistently in UI, reports, and notifications.

**SYS-3 · HIGH · Client cancellation/completion doesn't cascade (SRS §24.3, §5.2).**
**✅ CLOSED (Phase 3).** `clients/cancel` (`cancelClientPlan`) — one transaction: status+cancellationReason, all future sessions cancelled, outstanding installments waived (staff decision via `waiveOutstanding`), portal login blocked (`User.isActive=false`), ActivityLog rows; data retained. `clients/complete` — server-enforced preconditions (all sessions completed/cancelled, no mandatory outstanding payments; 409 with counts otherwise). Web `ClientProfilePage` cancel/complete now call the routes (hold stays a gateway status write — staff path). Proved: cancel cascades sessions/installments/login + keeps paid money and completed sessions intact; ActivityLog written. Tests: "Phase 3 — SYS-3".

`apps/web/src/pages/clients/ClientProfilePage.tsx:448-458` — cancel/hold/complete are plain `useUpdateClient` status writes. SRS §24.3 requires cancel to: cancel all future sessions, waive outstanding installments, block portal login. None happens. Complete (§5.2) requires all sessions completed/cancelled and no mandatory outstanding payments — only a warning is shown.
*Failure:* a cancelled client's scheduled sessions keep appearing in Consultations/dashboards/alerts, and their pending installments keep counting toward Outstanding/Overdue forever.
*Fix:* a privileged `clients/cancel` (and `clients/complete`) route, transactional, that cascades: cancel future sessions, waive outstanding installments, deactivate portal login, write ActivityLog; enforce the Complete preconditions server-side.
*Acceptance:* cancelling a client removes their future sessions from staff views and stops their installments counting as overdue.

**SYS-4 · HIGH · Editing a plan hard-deletes its services and mutates existing enrollments (SRS §7.4).**
**✅ CLOSED (Phase 3).** `ClientPlan.servicesSnapshot` (JSON, set at enrollment) now carries the service rules; `activateClientPlan` and the AssignmentsPage role slots read the snapshot (live plan as fallback for pre-snapshot enrollments). Editing a plan's services can no longer change an already-enrolled client's schedule or assignable roles. The PlansSettings `deleteMany`+`create` pattern remains for future enrollments only (service config rows; the retroactive-mutation defect is gone).

`apps/web/src/pages/settings/plans/PlansSettings.tsx:46-58` — edit uses `services: { deleteMany: {}, create: [...] }` (hard delete). `AssignmentsPage.tsx:133-136` derives consultant slots from the **live** `clientPlan.plan.services`, so editing a plan (e.g. removing styling) changes which consultants can be assigned to already-enrolled clients. Violates §7.4 ("editing a plan does not retroactively change existing schedules") and §25.3 (soft deletes only). Note the enrollment already correctly snapshots `planNameSnapshot`/`priceAtEnrollment` — the *services* just aren't snapshotted.
*Fix:* snapshot the service rules onto `ClientPlan` at enrollment (extend the existing snapshot), and have assignment/schedule logic read the snapshot, not the live plan. Alternatively version plans instead of mutating `PlanService` in place. Stop hard-deleting `PlanService`.
*Acceptance:* editing a plan's services leaves already-enrolled clients' schedules and assignable roles unchanged.

---

### Phase 4 — Data-loss & model integrity (HIGH/MEDIUM). Schema-level.

**DATA-1 · HIGH · Founder hard-delete of a Client cascades and destroys financial history.**
**✅ CLOSED (Phase 4).** Client `@@allow('delete')` removed entirely (no API path can delete a client; "removal" = the cancellation cascade from SYS-3, per SRS §24.3 "Client data is retained for reporting. Not deleted."). All client/installment FKs changed Cascade → Restrict (re-asserted in the Phase 4 migration), so even a server-side delete attempt fails instead of wiping paid money. Proved: gateway client delete denied (Phase 1 tests); migration applied on the test DB with Restrict constraints live.

`schema.zmodel:321` (`@@allow('delete', founder)` on Client) + `onDelete: Cascade` on Assessment (`:328`), ClientPlan (`:428`) → Installment (`:447`), Assignment (`:484`), Session (`:511`), FollowUp (`:553`), StylingOperation (`:583`), Document (`:628`). One delete wipes a client's entire financial+service record; Document rows cascade while the underlying Supabase Storage objects orphan. No `deletedAt`/soft-delete exists anywhere. Violates §25.3/§24.3.
*Fix:* remove the client delete policy (or restrict to leads with zero payments/sessions); add a soft-delete/archive flag used everywhere lists are queried; change cascades to `Restrict` for anything financial.

**DATA-2 · HIGH · Original scheduled date lost on reschedule (SRS §9.4).**
**✅ CLOSED (Phase 3/4).** `Session.originalScheduledDate` added (set on first reschedule) + before/after dates written to the ActivityLog (SYS-1). Proved: first reschedule stores the original date; a second reschedule leaves it untouched; ActivityLog has the change record. Tests: "Phase 3 — DATA-2".

`Session` has only `scheduledDate`; `sessions/reschedule/route.ts:50-53` overwrites it in place. §9.4: "Original scheduled date is preserved in history for reporting." After two reschedules the original is unrecoverable.
*Fix:* add `originalScheduledDate` (set once, on first reschedule) and/or write an ActivityLog entry (SYS-1) with before/after. Also (see MISC-3) only mark `delayed` when the new date is *later*.

**DATA-3 · MEDIUM · LeadSource / User hard-delete loses history.**
**✅ CLOSED (Phase 4).** `User` delete policy removed (`@@allow('create', founder)` only) and `LeadSource` delete removed (`create,update` only) — deactivate-only per SRS §22.1/§22.3. No UI used deletes (verified).

`schema.zmodel:382` allows LeadSource delete; `Client.leadSourceId` is optional so Prisma default `SetNull` silently nulls attribution → lead-source reports (§20.3) lose data. §22.3 says deactivate only. Same shape on `User` delete (`:261`) vs §22.1 "deactivate does not delete".
*Fix:* remove the delete policies; deactivate-only.

**DATA-4 · MEDIUM · `ClientPlan.clientId @unique` blocks re-enrollment/plan-change (SRS §24.6, §5.2).**
**⚠️ CLOSED for the data-loss half; re-enrollment model DEFERRED with reasoning.** The destructive half is closed: the Installment → ClientPlan cascade is now Restrict, so deleting a ClientPlan with approved installments fails loudly instead of destroying paid-money records. The full fix (to-many ClientPlan with `isCurrent`, partial unique index) is deferred: SRS §24.6 explicitly excludes mid-plan changes from MVP ("No mid-plan upgrades or downgrades in MVP"), and the to-many refactor ripples through 14 web/api files. Revisit when plan changes are product-approved.

`schema.zmodel:427` enforces one-plan-per-client-*ever*, not one-*active*-plan. A mid-journey plan change requires deleting the ClientPlan — which cascades and deletes **approved installments (paid-money records)**. `ClientPlan` also has no status field for a cancelled enrollment.
*Fix:* replace the unique with an `isCurrent`/`status` model (e.g. `@@unique` on `[clientId, isCurrent]`-style or app-enforced single active), and never cascade installments on plan change.

**DATA-5 · MEDIUM · Missing FK indexes (Postgres doesn't auto-index FKs).**
**✅ CLOSED (Phase 4).** Migration adds: `Installment.clientPlanId`, `Expense.submittedById/payeeId/clientId/categoryId`, `Task.clientId` + `Task.dueDate`, `Document.sessionId`.

Add indexes: `Installment.clientPlanId` (`:446` — payment pages filter by it), `Expense.submittedById/payeeId/clientId/categoryId` (`:685-712` — payout summaries group by payee), `Task.clientId` and `Task.dueDate` (`:753-770` — overdue-task queries), `Document.sessionId` (`:633`). Existing status/date indexes are good.

**DATA-6 · MEDIUM · Stored `overdue` enum values that nothing sets.**
**✅ CLOSED (Phase 4/3).** Decision: `overdue` IS a stored status, set by the daily job (SYS-2, SRS §8.6 "status changes to overdue"). The UI predicates are aligned in Phase 5 (CALC-6).

`Installment`/`FollowUp` have `overdue` in the enum but no writer (ties to SYS-2). Decide: keep purely derived (drop the stored value from the state machine) *or* have the scheduler set it. Don't keep both.

**DATA-7 · LOW · Date-only values stored as `DateTime` with local-time math.**
**✅ CLOSED (Phase 4) for the user-visible half.** All display/date-diff math is pinned to `Asia/Kolkata` (SRS §22.6): `formatDate` renders in IST and `daysUntil` computes IST calendar days (shared `format.ts`) — a UTC server or overseas staffer can no longer see a shifted date. Storage stays UTC-midnight timestamps; the remaining CALC/insights predicates get the same IST treatment in Phase 5.

`weddingDate`, `dueDate`, `scheduledDate`, `Expense.date` are timestamps; `scheduling.ts:36-38 stripTime` and `format.ts:31-38 daysUntil` use the runtime's local timezone. UTC server vs IST client shifts dates a day at boundaries (a "2026-11-01" session can render as Oct 31). SRS §22.6 fixes the business to IST.
*Fix:* normalize to UTC-midnight (or `@db.Date`) and do all date math in one canonical zone (IST). This underlies MISC-9 and several display bugs below.

**DATA-8 · LOW · Money as whole-rupee `Int`.**
**📄 Documented, no change (accepted constraint).** `Int` whole-rupee storage is safe (no floats); the rounding remainder lands on installment 1. A future Razorpay/paise integration must migrate to paise — noted for FEAT work.
 Safe (no float), but `generateInstallments` already shoves the rounding remainder into installment 1, and a future Razorpay integration (paise-denominated) will force a unit change. Acceptable now; document the constraint or migrate to paise before gateway work.

**DATA-9 · LOW · Over-nullable fields vs SRS.**
**📄 Partially closed.** `Session.rating` 1–5 bound is enforced (DB CHECK, Phase 1). `StylingOperation.stylingDate`/`stylistId` and `ContentItem.deadline` stay nullable: the styling-op create flow (gateway, staff) doesn't guarantee both, and forcing them would break creation. Revisit with the styling feature work (FEAT-7).
 `StylingOperation.stylingDate`/`stylistId` and `ContentItem.deadline` are nullable but SRS treats them as required at the relevant stage; `Session.rating` has no 1–5 DB/validation bound (ties to SEC-4). Tighten where the lifecycle guarantees a value.

---

### Phase 5 — Wrong data shown to users (MEDIUM). Derived-metric & display correctness.

> These are the "users are shown wrong things" bugs. Each one renders a number or state that is simply incorrect.

**CALC-1 · HIGH · "Not contacted in 7+ days" uses due date, not completion date.**
**✅ CLOSED (Phase 5).** `CroTrackingPage` recency now uses `completedDate` (a follow-up completed today but due 10 days ago is a contact).

`apps/web/src/pages/cro/CroTrackingPage.tsx:79-88` — recency computed from `f.dueDate`, not `completedDate`. A follow-up completed today but *due* 10 days ago still marks the client "not contacted 7+ days"; a future-dated follow-up counts as contact forever.
*Fix:* compute recency from `completedDate` (it exists on the model; the dashboard's `FollowUpRow` already selects it).

**CALC-2 · HIGH · Every freshly-activated client is instantly flagged "at risk".**
**✅ CLOSED (Phase 5).** Both `deriveAtRisk` (insights.ts) and the alerts `no_activity` rule skip clients whose first session hasn't occurred yet (no completed sessions + upcoming scheduled sessions). The at-risk anchor is the last completed session; the "low ratings" rule now fires on ≥1 rating among the last 3 (CALC-7). Note: the Client model has no stored `activationDate`, so "freshly activated" is derived as "no completed session yet and upcoming sessions exist" — documented deviation from the plan's wording.

`apps/web/src/lib/insights.ts:80-86` (and `alerts.ts:177-191`) — `if (!lastCompletedAt || lastCompletedAt < sevenDaysAgo)` flags a client with zero completed sessions the moment they turn Active, even if activated minutes ago with the first session next week. SRS §13.3 means "no activity 7+ days *while active*".
*Fix:* anchor to activation date: at-risk only if `max(activationDate, lastCompletedAt)` is older than 7 days; skip clients whose first session hasn't occurred yet. This is polluting the Founder dashboard and Alerts with false positives (alert fatigue that buries real signal).

**CALC-3 · MEDIUM · Sales-report conversion rate mixes two different sets.**
**✅ CLOSED (Phase 5).** One definition used for both the number and the label: conversions = leads created in the period that were converted in the period (`conversionDate` present), denominator = leads created in the period — SRS §20.3. "8 of 4" renders are impossible.

`apps/web/src/pages/reports/ReportsPage.tsx:536-541,575-581` — `convRate` uses (leads-in-period no longer `lead`) / leads-in-period, but the label reads "`conversions.length` of `leads.length`" where `conversions` = clients with `conversionDate` in period (a *different* set). Can render "50% — 8 of 4 leads".
*Fix:* pick one definition (SRS §20.3: converted / total leads per period) and use it for both the number and the label.

**CALC-4 · MEDIUM · Collection rate mixes mismatched sets (can exceed 100%).**
**✅ CLOSED (Phase 5).** Rate = approved amount among installments DUE in the period / amount due in the period (one set). "Collected (period)" keeps the cash view (approvals in range).

`ReportsPage.tsx:457-462` — collected = approvals with `approvedAt` in range; due = installments with `dueDate` in range. Early payments or late collections push the rate over 100% or understate it.
*Fix:* rate = approved amount among installments *due in period* / amount due in period.

**CALC-5 · MEDIUM · CRO/Coach "my performance" numbers not scoped to the user.**
**✅ CLOSED (Phase 5).** CRO view: conversions filtered by `convertedById === user.id` (field added to the dashboard query) and follow-up completion over the CRO's own follow-ups only. Coach view: "My clients" = active coach assignments, at-risk scoped to those clients.

`apps/web/src/pages/dashboard/DashboardPage.tsx:364-372` — "Conversions this month" counts every client with a `conversionDate` this month (no `convertedById === user.id`); follow-up completion rate is over all follow-ups all-time. `:574` — Coach "My clients" uses global `activeCount`.
*Fix:* filter by `convertedById`/`croId === user.id` and scope to the period.

**CALC-6 · MEDIUM · Overdue-display inconsistencies.**
**✅ CLOSED (Phase 5).** One shared predicate `isInstallmentOverdue` (past due, not approved/waived — SRS §18.3) drives the badge (`installmentDisplayStatus`), the counts, the alerts, and `PaymentsPage` (which previously rendered **waived** as red "(overdue)"). All day math in `insights.ts` is IST-pinned (MISC-9).

`insights.ts:35-40` `installmentDisplayStatus` maps only `pending`/`rejected` past-due to "overdue", but `isInstallmentOverdue` (used for counts/alerts/at-risk) also counts `proof_submitted` past-due — so the profile badge and the alert counts disagree for a stale submitted proof. `payments/PaymentsPage.tsx:105` — `overdue = r.status !== "approved" && daysUntil < 0` renders **waived** installments as red "(overdue)".
*Fix:* one shared predicate for "overdue" used by badge, counts, and alerts; exclude `waived`/`approved`.

**CALC-7 · MEDIUM · At-risk low-rating rule narrower than SRS.**
**✅ CLOSED (Phase 5).** Averages whatever ratings exist among the last 3 (≥1 rated); the separate "last 3 unrated" rule is untouched.

`insights.ts:73-78` requires *all* of the last 3 completed sessions to be rated before evaluating the <3.0 average, so two 1★ ratings out of three won't flag. SRS §13.3: "average rating across last 3 sessions below 3.0."
*Fix:* average whatever ratings exist among the last 3 (≥1 rated); keep the separate "last 3 unrated" rule.

**CALC-8 · MEDIUM · Errors render as empty/"all clear" states everywhere.**
**✅ CLOSED (Phase 5) for the list/dashboard surface.** New `QueryErrorState` component; wired into Clients, Payments, Consultations, CroTracking, Expenses, Documents, the founder/CRO/coach dashboard, and — critically — the Alerts page (which previously said "All clear" when its queries failed). `useDashboardData` now exposes `isError`/`error` across all seven of its queries. Remaining pages (Reports, Media, Styling, Tasks, portal pages) share the same pattern but are lower-stakes; noted for the PERF pass.

Every page destructures only `data`/`isLoading` (e.g. `ClientsPage.tsx:38-46`, `ConsultationsPage.tsx:79`, `PaymentsPage.tsx:38`, `useDashboardData.ts`). On an API/auth failure the user sees "No clients yet." / "All clear." — **dangerous on the Alerts page**, which reports "All clear" when its queries actually failed.
*Fix:* surface `isError` with a retry on every list/dashboard; never show a success/empty state on a failed query.

**CALC-9 · MEDIUM · Unassigning a team member silently does nothing.**
**✅ CLOSED (Phase 5).** `AssignmentsPage.save()` sends every slot with explicit `null` for cleared roles; `clients/assign` accepts `staffId: null` and deactivates that role's active assignment. No more "Team saved." with an unchanged team.

`apps/web/src/pages/assignments/AssignmentsPage.tsx:159-175` — `save()` filters to `sel[s.role]` truthy, so choosing "— Unassigned —" is dropped from the payload; `dirty` still flips, the UI says "Team saved.", the refetch reverts the select. The user believes they unassigned someone; they didn't.
*Fix:* send cleared slots explicitly (`staffId: null`) and have the server deactivate that assignment, or block unassignment with an explanation.

**CALC-10 · LOW · MoM revenue delta compares partial month to full month.**
**✅ CLOSED (Phase 5).** Previous month's collections are compared through the same day-of-month window ("so far vs so far").

`DashboardPage.tsx:124-130` — current (partial) month vs previous (full) month always looks like a crash early in the month. Compare same-day-through, or label it "so far".

**CALC-11 · LOW · "Conversion" cohort counts cancelled/completed leads as converted.**
**✅ CLOSED (Phase 5).** Conversion = `conversionDate` in the period, not `status !== "lead"`.

`useDashboardData.ts:269-273` uses `status !== "lead"`, so a lead created this month then cancelled counts as converted. Harmless today, wrong once pre-payment cancels happen.

**CALC-12 · LOW · 12-month chart shows duplicate month labels across a year boundary.**
**✅ CLOSED (Phase 5).** `lastMonths` and `ReportsPage.monthsInRange` labels now include the year ("Aug '25").

`insights.ts:106-121 lastMonths` labels month-only ("Aug"); a range spanning a year shows two "Aug" ticks (`ReportsPage monthsInRange`). Include the year (or "Aug '25").

**CALC-13 · LOW/VERIFY · Installment due dates finish before the plan does (possible off-by-one).**
**📄 UNCHANGED — verify-with-owner item (per the brief, not to be silently changed).** The cadence decision (`i * spanDays / count` for i=0…count-1, i.e. dues at day 0/30/60 for a 90-day plan) needs the founder's confirmation before any date-shifting change. If full-duration spacing is wanted, the divisor for the final installment becomes `count - 1`. Flagged for the owner.

`packages/shared/src/scheduling.ts:120-138 generateInstallments` uses `step = spanDays / count` and places due dates at `i * step` for `i = 0…count-1`. So for 3 installments over a 90-day plan, dues land at day 0, 30, 60 — the final payment is due a third of the way before the program ends, not at the end. This may be intentional (front-loaded pay-as-you-go), but it contradicts a natural reading of SRS §8.2 ("spread across the plan duration"). **Confirm the intended cadence with the founder**; if payments should span the full duration, the divisor for the last installment's placement should be `count - 1`. Flagged as VERIFY, not a definite bug — don't change without confirming intent (changing it moves real due dates).

---

### Phase 6 — Performance & scale (HIGH at target scale). Over-fetching.

**PERF-1 · HIGH · Systemic whole-table fetches, no pagination.**
**✅ CLOSED (Phase 6) for the heavy paths; follow-ups registered.** Dashboard sessions are now windowed server-side (`scheduledDate >= today-45d` — safe: at-risk only needs recent activity, and a client with nothing completed in 45 days IS at risk). All five list pages have take-based "Load more" pagination. Deferred follow-ups: a dashboard aggregate endpoint (raw rows still ship; 500-client target is tolerable), a client search box (SRS §25.1), and pagination on Reports/Media/Styling/Tasks (lower volume).

`apps/web/src/pages/dashboard/useDashboardData.ts:117-166` issues 7 unbounded `findMany`s (all clients with all installments, all sessions ever, all follow-ups, styling ops, tasks, content, staff) and computes every metric client-side — and `AlertsPage` reuses it verbatim. The same fetch-everything-filter-in-JS pattern is in `ConsultationsPage.tsx:79-86`, `PaymentsPage.tsx:38-49`, `CroTrackingPage.tsx:52-55`, `ExpensesPage.tsx:62-70`, `DocumentsPage.tsx:25-29`, `ReportsPage.tsx:115-155`. No `take`/`skip` anywhere; no pagination UI on any list.
*Failure:* at the SRS target (500 clients × installments × sessions × follow-ups) each dashboard load ships tens of thousands of rows; violates §25.1 (<2s loads).
*Fix:* server-side `where` for date windows/statuses (e.g. installments `status: proof_submitted` for the review tab; sessions `scheduledDate >= today-30d`); a dashboard aggregate endpoint that returns computed counts rather than raw rows; `take`-based pagination on Clients/Payments/Documents/Follow-ups lists; add a client search box (SRS §25.1). Ensure ZenStack read policies still scope results.

**PERF-2 · LOW · Partial-load rendering.**
**✅ CLOSED (Phase 6).** `isLoading` now covers all seven dashboard queries.

`useDashboardData.ts:181` — `isLoading` covers only clients+sessions; alerts/agenda/follow-up widgets first render on partial data. Gate on all queries.

---

### Phase 7 — Missing SRS features (build after the foundation is solid).

Each is specified in the SRS and absent (or stubbed) in code. Not bugs — scope. Prioritize by your cousin's operational need.

- **FEAT-1 · PDF payment receipts (§8.7).**
  **✅ DONE (Phase 7).** `apps/api/src/lib/receipt.ts` (pdfkit) generates an A4 receipt (client, code, plan, installment, method, INR amount, IST issue date) on every approval; stored in the private bucket as a `payment_receipt` Document (staff + client visible per §16.1). Best-effort — storage failure never fails the approval. `payment_receipt` doc type exists; nothing generates one on approval. Add generation + store in Documents (client-visible).
- **FEAT-2 · Notification preferences + Settings tabs (§22.5, §22.6).**
  **⏸️ DEFERRED.** Needs a preferences model + settings UI + configurable reminder lead times; the daily job (SYS-2) already reads notification timing constants that can become settings later. No preference model/UI; no branding/currency/timezone/notification-timing settings. Session-reminder lead time ("1 day before, configurable") isn't configurable. `Notification` has no channel/preference support.
- **FEAT-3 · Duplicate-lead detection (§24.8).**
  **✅ DONE (Phase 7).** `NewClientPage` queries existing clients by email/phone as the CRO types; matching clients are listed with a mandatory "verified separate person" checkbox before creation is allowed (SRS §24.8 warn-and-choose). `NewClientPage.tsx:39-76` creates directly with no phone/email lookup or dedupe-and-link flow.
- **FEAT-4 · Dedicated Calendar module (§11).**
  **⏸️ DEFERRED.** Month calendar already embedded in Consultations; week/day views + drag-to-reschedule + cross-entity calendar is a product-sized build — needs the owner's priority. Only a `MonthCalendar` component embedded in a few pages; no week/day views, no drag-to-reschedule, no cross-entity staff calendar, no per-role scoping view.
- **FEAT-5 · Wedding-date-change recalculation (§24.1).**
  **✅ DONE (Phase 7).** `updateWeddingDate` (`packages/db/src/server/weddingDateChange.ts`) + `clients/wedding-date` route (founder/ops): new date applied, future (scheduled/delayed) sessions regenerated from the enrollment's service snapshot, completed/cancelled untouched, `originalScheduledDate` preserved, ActivityLog + staff notification. Proved by tests ("Phase 7 — FEAT-5"). `weddingDate` is display-only in `ClientProfilePage`; changing it should recalc the schedule.
- **FEAT-6 · Reports gaps (§20).**
  **⏸️ DEFERRED.** Custom date range, PDF export, Payment Timeline, Client Reports tab, payout detail UI — all additive reporting work; the metrics feeding them were corrected in Phase 5 (CALC-3/4). No custom date range (only presets), CSV only (no PDF), and missing: Payment Timeline (§20.2), Client Reports tab (§20.5 satisfaction trend / active-over-time / at-risk-with-reasons), Coach performance & escalation rate, plan-upload timeliness (§20.4), consultant payout detail (sessions × rate + mark-as-paid — the §15.4 monthly payout workflow has no UI anywhere). Some metrics use `convertedById` as a proxy for active CRO assignment.
- **FEAT-7 · Styling ↔ session linkage & logistics view (§10).**
  **⏸️ DEFERRED.** The `toggleItem` stale-snapshot race noted in the finding also needs a server-side styling-op update path; needs a product decision on the §10.3 logistics view. `StylingOperation.sessionId` exists but ops and styling sessions are disconnected (completing the checklist completes no session); §10.3 logistics calendar (filter by date/stylist/location) absent; `toggleItem` (`StylingOperationsPage.tsx:71-93`) computes status from a stale snapshot (two quick toggles can write an inconsistent status); "Final confirmation" gated to admin/stylist but SRS says Consultant/Coach.
- **FEAT-8 · Team Tasks: cancel action + filters (§17.2).**
  **✅ DONE (cancel).** Cancel button on in-flight tasks (assigner/assignee/admin — schema-gated); §17.2 filters (assignee/priority/client/date) deferred — the board + drag/drop covers the core flow. `TeamTasksPage.tsx:48-52` buckets `cancelled` but no column renders it and there's no cancel UI; §17.2 filters (assignee/priority/client/date) absent; unknown statuses silently fall into "To do".
- **FEAT-9 · Follow-up actionability & auto-generation (§12).**
  **✅ DONE (actionability).** Founder/Ops can Complete/Snooze any follow-up (schema already allowed; the web gate was `croId === user.id` only). Snooze-note field and coach-action UI remain minor; auto-generation is covered by SYS-2. `CroTrackingPage.tsx:172` gates Complete/Snooze to `croId === user.id`, so Founder/Ops (and Coaches per §3.2) can't act; snooze is a silent +1 day with no note; payment-reminder/satisfaction-check auto-generation missing (ties to SYS-2); nothing seeds follow-ups if the CRO is assigned *after* activation (`activate/route.ts:109-117` seeds only weekly_checkin + progress_update).
- **FEAT-10 · Expense polish (§15).**
  **✅ DONE (data-loss + paise).** New `Expense.rejectionReason` column (migration) — rejection reasons never overwrite the submitter's notes, and are displayed on rejected rows; paise input is rejected instead of silently rounded. Clientless-expense receipts deferred (Document.clientId is required — a schema-wide ripple). Non-client expenses can't attach a receipt (`ExpensesPage.tsx:404-413` renders upload only when a client is selected, because the upload route requires `clientId`); `RejectExpenseModal:437-440` overwrites the submitter's `notes` with the rejection reason (data loss — add a dedicated rejection field); `:309` `Math.round(Number(amount))` silently drops paise input.
- **FEAT-11 · Media calendar-by-deadline view (§21).**
  **⏸️ DEFERRED.** Kanban + filters exist; the deadline calendar needs a new view. Kanban + filters exist; deadline calendar view not verified/absent.
- **FEAT-12 · Session-cancel confirmation & double-booking warnings (§24.5).**
  **✅ DONE (confirmation).** Cancelling a session now requires explicit confirmation (no more one-misclick data loss). §24.5 double-booking warnings deferred — needs schedule-wide overlap detection UI. `ConsultationsPage.tsx:130-133` cancels a session with zero confirmation next to Complete/Reschedule (one misclick, no undo); §24.5 overlap/double-booking warnings unimplemented; `NewClientPage` accepts past wedding dates; invite-link expiry isn't the SRS's 7 days (`clients/invite` delegates to Supabase default).

---

### Misc verified nits (fold into the nearest phase)

- **MISC-1 · Rejection discards proof linkage.**
**✅ CLOSED (was stale in this register).** `paymentRejection.ts` keeps `proofDocumentId` and records the old id in the audit `changes`; only `status`/`rejectionReason` change.
 `payments/reject/route.ts:62` sets `proofDocumentId: null`, orphaning which proof was rejected (hurts §23.3 audit). Keep the link; rely on status.
- **MISC-2 · Rejected first installment = portal dead-end.**
**✅ CLOSED (Phase 5).** `PortalPayments` now renders a link to `/portal/onboarding` for lead-status clients with a payable installment.
 `guards.tsx:38-43` `onboardingComplete` stays true after `payment_submitted` and never regresses; `PortalPayments.tsx:147,171-175` shows "finish onboarding" with no link back. Make that a `<Link to="/portal/onboarding">` or allow the upload card for lead-status clients (`rejected` is in `PAYABLE`).
- **MISC-3 · `delayed` applied even when rescheduling earlier.**
**✅ CLOSED (both halves, verification pass).** Delayed-only-when-later was closed in Phase 3; the missing past-date validation is now in `sessionReschedule.ts` (`PAST_DATE` → 400).
 `sessions/reschedule/route.ts:52` — SRS §9.2 defines Delayed as rescheduled to a *later* date; moving earlier still brands it `delayed`, and there's no future-date validation.
- **MISC-4 · Enroll doesn't require an assessment first (§5.3 state machine hole).**
**✅ CLOSED (verification pass).** `clientEnrollment.ts` requires `assessment.completedAt` (`NO_ASSESSMENT` → 409). Tests: Phase 2 STATE-7 block.
 `clients/enroll/route.ts:48-64` checks status/duplicate/plan-match but not that an assessment exists; a direct API call can select a plan before assessment.
- **MISC-5 · Unprovisioned login is a silent no-op.**
**✅ CLOSED (Phase 5).** `LoginPage` navigates on `session && !loading` and lets the guards render the "no account" notice.
 `LoginPage.tsx:15-19` — successful sign-in with no GTB user row leaves the form sitting with no error/navigation. Navigate on `session && !loading` and let the guard render the notice.
- **MISC-6 · Only 2 of 4 follow-up types seeded on activation** (`activate/route.ts:109-117`) — see FEAT-9.
**✅ CLOSED (verification pass) for the real defect.** `payment_reminder`/`satisfaction_check` are cron-generated (SYS-2) by design, so seeding 2 recurring types is correct — but the guard counted ALL follow-ups, so a cron-created reminder pre-activation suppressed seeding entirely. The guard now counts only the recurring types. Tests: "Verification — activation actor + seed guard".
- **MISC-7 · Staff re-invite ignores role changes**
**✅ CLOSED (Phase 5).** `staff/invite` applies a changed role/name on re-invite and validates the email format.
 (`staff/invite/route.ts:42-50`) — resending with a different `role` silently keeps the old one; no email-format validation.
- **MISC-8 · Assessment schema bounds**
**✅ CLOSED (Phase 5).** `age` 10–100, `heightCm` 100–250, `weightKg` 30–300 (integers).
 (`assessmentSchema.ts`) — `age`/`heightCm`/`weightKg` only `.positive()` (age 900 passes); free-text unbounded; rating has no 1–5 server bound (ties to SEC-4).
- **MISC-9 · Timezone fragility**
**✅ CLOSED (Phase 5).** Shared `format.ts` (formatDate/daysUntil) and web `insights.ts` (startOfDay/isSameDay/overdue) are IST-pinned.
 — see DATA-7; also `CALC`/`insights` date math is browser-local while values arrive as UTC-midnight ISO; a staffer abroad sees due-today/overdue shifted a day. `format.ts:21-29 formatDate` and `:31-38 daysUntil` both use the browser's local zone with no `timeZone` option; pin to `Asia/Kolkata` per SRS §22.6.
- **MISC-10 · Client-code collision has no retry.**
**✅ CLOSED (verified).** `NewClientPage` already retries (4 attempts) on the `clientCode` unique P2002. No change needed.
 `packages/shared/src/format.ts:9-11 generateClientCode` is a random 4-digit suffix and its own comment says "callers should retry on the rare collision." Verify `NewClientPage`/`clients/invite` actually catch the `clientCode @unique` P2002 and regenerate; if they don't, client creation randomly 500s (~1-in-9000, but it will happen). Add a bounded retry loop server-side.

---

## 4. Suggested phase sequencing (summary)

1. **Phase 0 — Prereqs:** ~~wire a test runner if none exists; set up the ZenStack regenerate + migrate loop; confirm Supabase project settings (public sign-up off, email confirmation on) for SEC-7.~~ **DONE** — vitest suite lives in `packages/db` (`pnpm --filter @gtb/db test`, disposable Postgres in Docker, migrations auto-applied by the global setup; `.env.test` points at the test DB only). SEC-7's Supabase dashboard check is still the owner's to do.
2. **Phase 1 — Data-integrity & write-access correctness (CRITICAL):** SEC-1…SEC-17. ~~Field-level policies / gateway hardening~~ **DONE** — all closed and proven by 48 automated tests; two new same-class findings (SEC-18, SEC-19) found and fixed during the pass. *This was done before real users touch the system — it's what stops the app from showing fabricated money and status.*
3. **Phase 2 — Money & state integrity:** STATE-1…STATE-7 (transactions + conditional updates + unique constraints).
4. **Phase 3 — Automation layer:** SYS-1…SYS-4 (audit writes, scheduler, cancellation cascade, plan-service snapshot).
5. **Phase 4 — Data-loss & model:** DATA-1…DATA-9 (soft-delete, de-cascade, indexes, re-enrollment model).
6. **Phase 5 — Wrong-data-shown:** CALC-1…CALC-12 + MISC nits (metric correctness, error states).
7. **Phase 6 — Performance:** PERF-1…PERF-2 (server-side filtering, pagination, aggregate endpoint).
8. **Phase 7 — Missing features:** FEAT-1…FEAT-12, prioritized by operational need.

Phases 1–4 are "fix the foundation". They concentrate in `schema.zmodel`, the custom API routes, and one new scheduler — a contained effort, not a rewrite.

## 5. What is already correct (do not regress)

Fail-closed auth with per-request role re-read (`auth.ts`); service-role key isolation (server-only, never imported in `apps/web`); `clients/assign` transactional with preserved assignment history (`assign/route.ts:64`); server-side price snapshotting on enroll (client never sends price); private storage bucket + short-lived signed URLs + traversal-safe keys; `consultation_notes` hidden from clients (schema + signed-url); the scheduling/compression/installment math in `packages/shared/scheduling.ts` (faithful to §7.3/§8.2, modulo CALC-13); lead-phase never regresses (`LEAD_PHASE_ORDER` guards); `en-IN` currency formatting (₹, lakh grouping); refresh-safe onboarding wizard driven entirely by server state. Enums are in perfect sync between `schema.zmodel` and `packages/shared`.

---

## Appendix A — ZenStack field-level policy mechanics (for Phase 1)

The generic gateway hands ZenStack a Prisma client enhanced with the caller's identity, so the fix for SEC-1…6/17 lives in `packages/db/schema.zmodel` — no gateway middleware needed. ZenStack supports **field-level** `@allow`/`@deny` and the `future()` helper (the post-write row state). Key facts:

- A **field-level `@deny('update', <cond>)`** on a field means: if `<cond>` holds for the caller, an update that *changes that field* is rejected. Field-level rules combine with model-level `@@allow` rules (deny wins).
- **`future()`** refers to the entity *after* the proposed write — use it to constrain what a value may transition *to* (e.g. a client may only move an installment *to* `proof_submitted`).
- After any `.zmodel` edit: `pnpm db:generate` (regenerates Prisma schema + client + zod + hooks) then create/apply a migration.

**Worked example — SEC-2 (client must not self-approve an installment).** The legitimate client write is: attach a proof and move `pending|overdue|rejected → proof_submitted`, touching only `status` + `proofDocumentId`. Everything else (approval, amount, method) is staff-only. Sketch:

```zmodel
model Installment {
  // ...fields...

  // Staff paths unchanged:
  @@allow('update', auth().role == founder || auth().role == ops_head || auth().role == cro)

  // Client self-service, tightly scoped: only when the resulting status is
  // proof_submitted (i.e. they can submit a proof, never approve/waive).
  @@allow('update',
    clientPlan.client.userId == auth().id && future().status == proof_submitted)

  // Belt-and-suspenders: even on an allowed path, a client can never write these.
  @@deny('update', clientPlan.client.userId == auth().id && future().amount != amount)
  @@deny('update', clientPlan.client.userId == auth().id && future().approvedById != null)
  @@deny('update', clientPlan.client.userId == auth().id && future().paymentMethod != null)
}
```

Apply the same shape to: **User** (client/non-founder cannot change `role`, `isActive`, `authId`, `email` — SEC-1), **Client** (self may change only `name`/`phone`/`avatarUrl` and forward-only `leadPhase`, never `status`/`clientCode`/`conversionDate` — SEC-3), **Session** (client may write only `rating` within 1–5 and `ratingFeedback`, only when `status == completed` — SEC-4), **Expense** (non-admin create forces `status == submitted`, `submittedById == auth().id`, no `approvedById` — SEC-6), **Document** (`create` restricted to owner/assigned-staff/admin, and `fileUrl` never client-writable — SEC-5), **Assessment** (`completedAt` server-only — SEC-17). Validate the exact operators against the ZenStack version pinned in `packages/db/package.json` before relying on syntax; if a `future()` comparison isn't expressible for a given field, fall back to strategy (B) and route that model's writes through a custom endpoint.

## Appendix B — the transaction+guard pattern (for Phase 2)

Every money/state race (STATE-1…3) has the same fix shape. Model it on the one route that already does it right, `clients/assign/route.ts:64`:

```ts
await prisma.$transaction(async (tx) => {
  // 1. Conditional update instead of read-then-write: the WHERE clause is the guard.
  const res = await tx.installment.updateMany({
    where: { id, status: { notIn: ["approved", "waived"] } },
    data: { status: "approved", approvedById: authUser.id, approvedAt: new Date() /* ... */ },
  });
  if (res.count !== 1) throw new ConflictError("Already approved");

  // 2. Derive dependent state from a FRESH count inside the same tx (STATE-1 conversion).
  const priorApproved = await tx.installment.count({ where: { /* ... */ status: "approved" } });
  // ...convert client only if this is genuinely the first, all-or-nothing with step 1.
});
```

Pair each with the missing DB constraint (STATE-4) so a concurrent write that slips past the app guard still can't create a duplicate row: `@@unique([clientPlanId, installmentNumber])`, `@@unique([clientId, serviceType, sessionNumber])` on Session, a unique/partial index for one consultant-fee Expense per `sessionId`, and a partial unique index for one active Assignment per `(clientId, role)`.

---

## Verification pass — findings register (V-*) · 2026-08-14 · ALL CLOSED

A full re-audit of the closed register (3 parallel review agents + suite run) found the gaps below. All are fixed, proven by `packages/db/tests/verification-pass.test.ts` plus updated Phase 1/2 tests (97 tests green). Migration: `20260814060415_verification_pass_policies_indexes`.

**Same-class policy holes (the SEC-1…6 class, missed in Phase 1):**
- **V-1 · HIGH ·** `Installment.proofDocumentId` was client-writable on the gateway with no ownership check — a client could attach ANY document (incl. another client's) as their proof, bypassing `payments/submit-proof`, and re-point the proof on an approved installment. *Fix:* client Installment update path removed entirely; the route is the only proof path.
- **V-2 · HIGH ·** Consultant `Session` gateway update was an every-field grant (ZenStack can't field-restrict this model): self-awarded ratings, self-completions skipping the payout expense + audit, `clientId`/`scheduledDate` rewrites. *Fix:* consultant gateway path removed; new `sessions/cancel` route (audit-logged) + existing complete/reschedule routes; `ConsultationsPage` rewired.
- **V-3 · MEDIUM ·** `groupBy`/`aggregate` bypass field-level read policy in ZenStack — a client could `groupBy` `User.email/phone` and rebuild the staff directory SEC-11 hid. *Fix:* the gateway blocks aggregation verbs on models with field-level read denies (`user`).
- **V-4 · HIGH ·** `ClientPlan` create/update was granted to every CRO, unscoped and field-free (`priceAtEnrollment`, `servicesSnapshot`, `clientId` rewritable on any enrollment). *Fix:* admin-only.
- **V-5 · MEDIUM ·** `Installment` create/update was granted to every CRO on rows they couldn't even read. *Fix:* CRO writes scoped to actively-assigned clients; CRO cannot set `approvedById` to anyone but themself.
- **V-6 · MEDIUM ·** SEC-19 (id immutability) was applied to only 5 of 20 models. *Fix:* `@deny('update', true)` on every writable model's id (Session via model-level `future().id != id` — field denies are unsafe on that model).
- **V-7 · MEDIUM ·** `Notification` update let a user re-point `userId` and rewrite content — an in-app phishing primitive. *Fix:* only `isRead` is user-writable.
- **V-8 · MEDIUM ·** `Client.userId` was rewritable by assigned CRO/coach (gateway analogue of SEC-8 account-linking) and `weddingDate` was staff-writable without schedule recalc. *Fix:* both are server-route-only now (model-level deny for the nullable `userId`).
- **V-9 · MEDIUM ·** `Task` create allowed spoofed `assignedById` ("task from the founder"); assignees could reassign/reattribute. *Fix:* create-as-self deny (SEC-6 pattern) + field guards on `assignedById`/`assignedToId`/`clientId`.
- **V-10 · MEDIUM ·** `FollowUp` update had no field guard — create-then-update trivially bypassed SEC-16, and `croId`/`clientId` were rewritable. *Fix:* field denies (admin may reattribute `croId`).
- **V-11 · MEDIUM ·** `StylingOperation` update let the stylist relink `clientId`/`sessionId`/`stylistId`. *Fix:* model-level + field denies; checklist writes unaffected.
- **V-12 · LOW ·** `PlanService`/`LeadSource` reads leaked inactive-plan composition and marketing channels to clients (partial SEC-14). *Fix:* scoped reads.
- **V-13 · LOW ·** `User.authId` (Supabase uid) was readable by clients. *Fix:* same read deny as email/phone.
- **V-14 · LOW ·** `ContentItem` granted `all` to every media user (delete-the-whole-calendar). *Fix:* delete is founder-only.
- **V-15 · HIGH (latent, pre-existing) ·** Every self-path field deny of the shape `<nullable userId> == auth().id` fired on NULL (ZenStack treats the unknown comparison as deny), locking STAFF out of guarded fields on pre-registration leads (Client notes/status/etc., Installment fields on plans of unlinked clients). *Fix:* all such denies are now null-safe (`userId != null && …`).

**Wrong-data / web regressions (introduced by the remediation itself):**
- **V-16 · HIGH ·** CALC-10's "fix" was inverted: the previous-month window ended at *this* month's day-of-month, double-counting the entire current month into `prevCollections` — the founder's MoM delta was systematically wrong. *Fix:* true prev-month same-day window, IST-bucketed.
- **V-17 · HIGH ·** PERF-1 pagination semantics: PaymentsPage had a Load-more button but **no `take`** (button was a no-op, whole table still fetched); ExpensesPage computed its money stat cards over the first 50 rows; Expenses/Documents/CroTracking gated Load-more on the *filtered* length (button vanished under any filter, stranding older pages); CroTracking fetched oldest-first so "Due today" went empty past ~100 rows and the "not contacted 7+ days" banner false-flagged contacted clients. *Fix:* server-side WHERE per tab/filter everywhere, real `take`s, server counts for tab badges, aggregate queries for the Expense stat cards, dedicated recent-contacts query, page reset on filter change.
- **V-18 · HIGH ·** The 45-day dashboard session window × CALC-2's "just started" skip hid exactly the clients the at-risk rule exists for (dormant, with a future session booked): zero completed sessions *in the window* + upcoming ⇒ skipped. *Fix:* lifetime completed-session `_count` on the client query feeds `deriveAtRisk`/alerts; "Pending uploads" now has its own unwindowed query.
- **V-19 · MEDIUM ·** IST pinning was half-applied: month bucketing (`lastMonths`, `monthKey`, report ranges, dashboard `monthStart`, `ExpensesPage.isThisMonth`) and `alerts.ts`'s 7-day anchor still used browser-local getters. *Fix:* `istYearMonth`/`istDayOfMonth`/`istMonthStart` helpers; all month math IST.
- **V-20 · MEDIUM ·** DATA-5's FK indexes were created in the Phase-4 migration but never declared in the schema, so the `_fixes` migration diffed them all away. *Fix:* `@@index` declarations + re-creating migration (can't regress again).
- **V-21 · MEDIUM ·** FEAT-5 (wedding-date recalc) had no caller — the route was dead code and staff edits went through the gateway without recalculation. *Fix:* gateway `weddingDate` writes denied; `updateWeddingDate()` API wrapper + edit modal on `ClientProfilePage`.

**Automation / route defects:**
- **V-22 · MEDIUM ·** Cron day math was server-local (wrong day on a UTC host for "tomorrow"/"due today"/dedupe); the satisfaction-check follow-up regenerated daily after completion (guard was "no *pending* row", not the milestone); payment reminders regenerated after completion; `notifyOncePerDay` collapsed distinct entities (3 sessions tomorrow → 1 reminder); overdue flips fired ON the due date. *Fix:* IST boundaries throughout, milestone-keyed and window-keyed dedupe markers, entity ids in notification linkPaths, strictly-past-day overdue flips. Tests: "Verification — cron idempotency & day-boundary fixes".
- **V-23 · MEDIUM ·** `clients/complete` ran its preconditions outside the transaction and `cancelClientPlan`'s status flip was unconditional — concurrent Cancel+Complete interleaved. *Fix:* preconditions in-tx + guarded `updateMany` on both.
- **V-24 · LOW ·** Re-submitting a proof document already linked to another installment → unhandled P2002 500 (*fix:* → `ProofConflictError` 409); approving a nonexistent installment → 409 "already approved" (*fix:* → 404); activation audit rows had no actor (*fix:* actorId threaded); receipt Documents stored `fileSize: 0` (*fix:* real byte length); reschedule accepted past dates (*fix:* `PAST_DATE` 400 — closes MISC-3's second half); MISC-4 assessment gate added; MISC-6 seed guard fixed; dupe-lead lookup debounced; Assignments selects re-sync after save; unauthorized task-cancel clicks get feedback.

**Still open / owner actions (unchanged):** SEC-7 Supabase dashboard settings; SYS-2 external cron trigger; CALC-13 cadence confirmation; deferred FEAT-2/4/6/7/11 and DATA-4's re-enrollment model; CALC-8 error states on the lower-stakes pages (Reports/Media/Styling/Tasks/portal); a dashboard aggregate endpoint and a client search box (PERF follow-ups).

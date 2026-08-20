-- Phase 2 — money & state integrity (STATE-2, STATE-3, STATE-4).
--
-- DB-level backstops for the race fixes. The app routes were changed to
-- conditional updates inside transactions; these constraints make a duplicate
-- impossible even if two requests slip past the app guard concurrently.

-- STATE-4: one installment per (plan, number) — a double-approval can never
-- create two ledger rows for the same payment.
CREATE UNIQUE INDEX "Installment_clientPlanId_installmentNumber_key" ON "Installment"("clientPlanId", "installmentNumber");

-- STATE-2: one session number per (client, service) — a double-activate can
-- never generate a duplicate schedule.
CREATE UNIQUE INDEX "Session_clientId_serviceType_sessionNumber_key" ON "Session"("clientId", "serviceType", "sessionNumber");

-- STATE-3: at most one consultant-fee expense per session (partial — only
-- session-linked expenses, which are consultant fees).
CREATE UNIQUE INDEX "Expense_sessionId_key" ON "Expense"("sessionId") WHERE "sessionId" IS NOT NULL;

-- STATE-4: at most one ACTIVE assignment per (client, role) — SRS §14.2
-- "exactly one active staff per role per client", enforced by the DB.
CREATE UNIQUE INDEX "Assignment_clientId_role_active_key" ON "Assignment"("clientId", "role") WHERE "isActive" = true;

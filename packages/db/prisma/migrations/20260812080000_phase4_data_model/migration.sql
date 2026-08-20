-- Phase 4 — data-loss & model integrity.
--
-- DATA-1: financial/client cascades are now RESTRICT so no delete path can
-- ever wipe paid-money records; the gateway no longer exposes client deletes
-- (policy change in schema.zmodel). Prisma emits the FK constraints with
-- ON DELETE RESTRICT when the schema says so, but for safety this migration
-- re-asserts them explicitly.
-- DATA-5: missing FK/query indexes (Postgres does not auto-index FKs).

-- Re-assert RESTRICT on the client-facing FKs.
ALTER TABLE "Assessment" DROP CONSTRAINT "Assessment_clientId_fkey", ADD CONSTRAINT "Assessment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientPlan" DROP CONSTRAINT "ClientPlan_clientId_fkey", ADD CONSTRAINT "ClientPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Installment" DROP CONSTRAINT "Installment_clientPlanId_fkey", ADD CONSTRAINT "Installment_clientPlanId_fkey" FOREIGN KEY ("clientPlanId") REFERENCES "ClientPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_clientId_fkey", ADD CONSTRAINT "Assignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" DROP CONSTRAINT "Session_clientId_fkey", ADD CONSTRAINT "Session_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUp" DROP CONSTRAINT "FollowUp_clientId_fkey", ADD CONSTRAINT "FollowUp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StylingOperation" DROP CONSTRAINT "StylingOperation_clientId_fkey", ADD CONSTRAINT "StylingOperation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" DROP CONSTRAINT "Document_clientId_fkey", ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DATA-5: FK/query indexes.
CREATE INDEX "Installment_clientPlanId_idx" ON "Installment"("clientPlanId");
CREATE INDEX "Expense_submittedById_idx" ON "Expense"("submittedById");
CREATE INDEX "Expense_payeeId_idx" ON "Expense"("payeeId");
CREATE INDEX "Expense_clientId_idx" ON "Expense"("clientId");
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX "Document_sessionId_idx" ON "Document"("sessionId");

-- CreateIndex
CREATE INDEX "Document_sessionId_idx" ON "Document"("sessionId");

-- CreateIndex
CREATE INDEX "Expense_submittedById_idx" ON "Expense"("submittedById");

-- CreateIndex
CREATE INDEX "Expense_payeeId_idx" ON "Expense"("payeeId");

-- CreateIndex
CREATE INDEX "Expense_clientId_idx" ON "Expense"("clientId");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Installment_clientPlanId_idx" ON "Installment"("clientPlanId");

-- CreateIndex
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

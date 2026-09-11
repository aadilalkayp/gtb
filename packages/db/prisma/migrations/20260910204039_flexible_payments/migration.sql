-- Flexible payments (SRS §8 rework): the fixed Installment rows are split into
-- PaymentMilestone (the expected schedule — a plan for the money) and Payment
-- (the actual money: client submissions, staff-recorded payments, waivers).
-- Existing data is migrated, not dropped:
--   * every Installment becomes a PaymentMilestone (number/amount/dueDate);
--   * Installments that carried money history become Payment rows
--     (approved → approved, proof_submitted → pending_review,
--      rejected → rejected, waived → approved waiver);
--   * pending/overdue Installments create no Payment — they are simply
--     unpaid milestones now ("overdue" becomes a derived pace status).

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('payment', 'waiver');

-- CreateTable
CREATE TABLE "PaymentMilestone" (
    "id" TEXT NOT NULL,
    "clientPlanId" TEXT NOT NULL,
    "milestoneNumber" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "clientPlanId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'payment',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending_review',
    "paymentMethod" "PaymentMethod",
    "proofDocumentId" TEXT,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Backfill 1/2: the old schedule survives verbatim as milestones (ids kept —
-- stored receipt PDFs reference them as receipt ids).
INSERT INTO "PaymentMilestone" ("id", "clientPlanId", "milestoneNumber", "amount", "dueDate", "createdAt", "updatedAt")
SELECT "id", "clientPlanId", "installmentNumber", "amount", "dueDate", "createdAt", "updatedAt"
FROM "Installment";

-- Backfill 2/2: installments that carried money history become ledger rows.
-- submittedBy: attributed to the client's portal user when a proof was
-- attached (the only path that set one); staff-recorded rows keep NULL.
INSERT INTO "Payment" (
    "id", "clientPlanId", "amount", "kind", "status", "paymentMethod",
    "proofDocumentId", "submittedById", "approvedById", "approvedAt",
    "rejectionReason", "notes", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    i."clientPlanId",
    i."amount",
    CASE WHEN i."status" = 'waived' THEN 'waiver' ELSE 'payment' END::"PaymentKind",
    CASE i."status"
        WHEN 'approved' THEN 'approved'
        WHEN 'waived' THEN 'approved'
        WHEN 'proof_submitted' THEN 'pending_review'
        WHEN 'rejected' THEN 'rejected'
    END::"PaymentStatus",
    i."paymentMethod",
    i."proofDocumentId",
    CASE WHEN i."proofDocumentId" IS NOT NULL THEN c."userId" END,
    i."approvedById",
    CASE WHEN i."status" IN ('approved', 'waived') THEN COALESCE(i."approvedAt", i."updatedAt") END,
    i."rejectionReason",
    i."notes",
    i."createdAt",
    i."updatedAt"
FROM "Installment" i
JOIN "ClientPlan" cp ON cp."id" = i."clientPlanId"
JOIN "Client" c ON c."id" = cp."clientId"
WHERE i."status" IN ('approved', 'waived', 'proof_submitted', 'rejected');

-- DropForeignKey
ALTER TABLE "Installment" DROP CONSTRAINT "Installment_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "Installment" DROP CONSTRAINT "Installment_clientPlanId_fkey";

-- DropForeignKey
ALTER TABLE "Installment" DROP CONSTRAINT "Installment_proofDocumentId_fkey";

-- DropTable
DROP TABLE "Installment";

-- DropEnum
DROP TYPE "InstallmentStatus";

-- CreateIndex
CREATE INDEX "PaymentMilestone_dueDate_idx" ON "PaymentMilestone"("dueDate");

-- CreateIndex
CREATE INDEX "PaymentMilestone_clientPlanId_idx" ON "PaymentMilestone"("clientPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMilestone_clientPlanId_milestoneNumber_key" ON "PaymentMilestone"("clientPlanId", "milestoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_proofDocumentId_key" ON "Payment"("proofDocumentId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_approvedAt_idx" ON "Payment"("approvedAt");

-- CreateIndex
CREATE INDEX "Payment_clientPlanId_idx" ON "Payment"("clientPlanId");

-- AddForeignKey
ALTER TABLE "PaymentMilestone" ADD CONSTRAINT "PaymentMilestone_clientPlanId_fkey" FOREIGN KEY ("clientPlanId") REFERENCES "ClientPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientPlanId_fkey" FOREIGN KEY ("clientPlanId") REFERENCES "ClientPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_proofDocumentId_fkey" FOREIGN KEY ("proofDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

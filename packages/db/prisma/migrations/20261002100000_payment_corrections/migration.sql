-- Payment corrections (Oct 2026): staff can edit any payment record, move an
-- approved one back to review, reject it, or void it (kept for audit,
-- excluded from all totals). Payments carried over from the old
-- fixed-installment model are flagged so staff can review them: back then a
-- whole installment was approved even when only part of it had been paid.

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'voided';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT,
ADD COLUMN     "legacyImported" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voidReason" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the flexible-payments migration converted every old Installment
-- into a Payment row, keeping the installment's createdAt. Anything created
-- before that migration finished is therefore an imported row. (On a fresh
-- database there are none, and the subquery simply matches nothing.)
UPDATE "Payment"
SET "legacyImported" = true
WHERE "createdAt" < (
    SELECT "finished_at" FROM "_prisma_migrations"
    WHERE "migration_name" = '20260910204039_flexible_payments'
      AND "finished_at" IS NOT NULL
    ORDER BY "finished_at" DESC
    LIMIT 1
);

-- Negotiated pricing (Oct 2026): fees are agreed personally with each client,
-- so plans stop carrying a price and become service templates. The per-client
-- figure moves to ClientPlan.agreedPrice, nullable until staff record it.
-- Existing enrollments keep their snapshotted price as the agreed price.

-- AlterTable
ALTER TABLE "ClientPlan" RENAME COLUMN "priceAtEnrollment" TO "agreedPrice";
ALTER TABLE "ClientPlan" ALTER COLUMN "agreedPrice" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "installmentCount",
DROP COLUMN "price";

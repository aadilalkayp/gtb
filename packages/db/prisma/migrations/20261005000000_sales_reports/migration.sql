-- Sales daily reports (SALES_REPORTS_DESIGN.md): the lead's creator on Client
-- (sales credit) and the CRO end-of-day report. Additive only.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "createdById" TEXT;

-- CreateTable
CREATE TABLE "SalesReport" (
    "id" TEXT NOT NULL,
    "croId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "dayOff" BOOLEAN NOT NULL DEFAULT false,
    "enquiries" INTEGER,
    "leadFollowUps" INTEGER,
    "hotLeads" INTEGER,
    "plannedFollowUps" INTEGER,
    "challenges" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesReport_day_idx" ON "SalesReport"("day");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReport_croId_day_key" ON "SalesReport"("croId", "day");

-- CreateIndex
CREATE INDEX "Client_createdById_idx" ON "Client"("createdById");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReport" ADD CONSTRAINT "SalesReport_croId_fkey" FOREIGN KEY ("croId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: the Team Pulse audit trail (live since 2026-10-04) records who
-- created each lead since then. Older leads stay null and fall back to the
-- assigned CRO for sales credit.
UPDATE "Client" c
SET "createdById" = a."performedById"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "performedById"
  FROM "ActivityLog"
  WHERE "entityType" = 'Client' AND "verb" = 'client.created' AND "performedById" IS NOT NULL
  ORDER BY "entityId", "createdAt" ASC
) a
WHERE c."id" = a."entityId"
  AND c."createdById" IS NULL
  AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = a."performedById");

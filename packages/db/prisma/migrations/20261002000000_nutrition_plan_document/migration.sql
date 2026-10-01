-- Nutrition plan PDF (Oct 2026): the trainer uploads the client's diet plan as
-- part of creating a fitness plan. It lands in the client's document room as a
-- nutrition_plan Document linked to the plan; a re-upload replaces it.

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'nutrition_plan';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "fitnessPlanId" TEXT;

-- CreateIndex
CREATE INDEX "Document_fitnessPlanId_idx" ON "Document"("fitnessPlanId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_fitnessPlanId_fkey" FOREIGN KEY ("fitnessPlanId") REFERENCES "FitnessPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

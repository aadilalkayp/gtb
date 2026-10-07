-- Generated with `prisma migrate diff` (database at the previous migration
-- head -> schema.prisma). The diff also proposed dropping
-- "coach_article_embeddings"; those statements were removed: that table is
-- raw SQL (migration 20260911000000), deliberately not in the Prisma schema.

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('active', 'superseded');

-- CreateEnum
CREATE TYPE "SkinPhotoAngle" AS ENUM ('front', 'left', 'right');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'skin_photo';

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "activityLevel" TEXT,
ADD COLUMN     "consentAccuracy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentProfessionalReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dermTreatmentFlag" BOOLEAN,
ADD COLUMN     "dietaryPreferenceOther" TEXT,
ADD COLUMN     "dietaryRestrictions" TEXT,
ADD COLUMN     "fitnessGoal" TEXT,
ADD COLUMN     "fitnessGoalOther" TEXT,
ADD COLUMN     "healthConditionFlag" BOOLEAN,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "skinAllergyFlag" BOOLEAN,
ADD COLUMN     "skinConcernOther" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "version" INTEGER;

-- CreateTable
CREATE TABLE "SkinPhoto" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "angle" "SkinPhotoAngle" NOT NULL,
    "documentId" TEXT NOT NULL,
    "previewPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkinPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkinPhoto_documentId_key" ON "SkinPhoto"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "SkinPhoto_assessmentId_angle_key" ON "SkinPhoto"("assessmentId", "angle");

-- CreateIndex
CREATE INDEX "Document_clientId_type_version_idx" ON "Document"("clientId", "type", "version");

-- AddForeignKey
ALTER TABLE "SkinPhoto" ADD CONSTRAINT "SkinPhoto_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkinPhoto" ADD CONSTRAINT "SkinPhoto_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;


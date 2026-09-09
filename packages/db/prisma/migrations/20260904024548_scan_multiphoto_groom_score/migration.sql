-- CreateEnum
CREATE TYPE "ScanPhotoAngle" AS ENUM ('front', 'left', 'right', 'full_body');

-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "confidenceScore" INTEGER,
ADD COLUMN     "fitnessScore" INTEGER,
ADD COLUMN     "selfReport" JSONB;

-- CreateTable
CREATE TABLE "ScanPhoto" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "angle" "ScanPhotoAngle" NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanPhoto_scanId_idx" ON "ScanPhoto"("scanId");

-- AddForeignKey
ALTER TABLE "ScanPhoto" ADD CONSTRAINT "ScanPhoto_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

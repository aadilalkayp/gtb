-- CreateEnum
CREATE TYPE "BlueprintStatus" AS ENUM ('awaiting_photos', 'under_review', 'retake_requested', 'published');

-- CreateEnum
CREATE TYPE "StylingPhotoSlot" AS ENUM ('front', 'left_side', 'right_side', 'back', 'full_body', 'extra');

-- CreateEnum
CREATE TYPE "StylingItemKind" AS ENUM ('outfit', 'footwear', 'eyewear', 'product');

-- CreateEnum
CREATE TYPE "StylingItemPriority" AS ENUM ('must_have', 'nice_to_have');

-- CreateEnum
CREATE TYPE "StylingLibraryKind" AS ENUM ('product', 'barber_line', 'essential');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'styling_photo';
ALTER TYPE "DocumentType" ADD VALUE 'styling_image';

-- CreateTable
CREATE TABLE "StylingBlueprint" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "BlueprintStatus" NOT NULL DEFAULT 'awaiting_photos',
    "photosSubmittedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "checkedEssentialIds" TEXT[],
    "faceShape" TEXT,
    "skinTone" TEXT,
    "skinToneHex" TEXT,
    "hairType" TEXT,
    "beardType" TEXT,
    "bodyType" TEXT,
    "heightCm" INTEGER,
    "existingStyle" TEXT,
    "stylePreferences" TEXT,
    "styleTags" TEXT[],
    "styleDescription" TEXT,
    "hairFrontDocId" TEXT,
    "hairSideDocId" TEXT,
    "hairBackDocId" TEXT,
    "barberBrief" TEXT[],
    "hairNotes" TEXT,
    "sectionsDone" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StylingBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylingPhoto" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "slot" "StylingPhotoSlot" NOT NULL,
    "documentId" TEXT NOT NULL,
    "retakeNote" TEXT,
    "retakeRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StylingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylingLook" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventLabel" TEXT,
    "imageDocId" TEXT,
    "description" TEXT,
    "outfit" TEXT,
    "footwear" TEXT,
    "accessories" TEXT,
    "colors" TEXT[],
    "stylistNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StylingLook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylingPalette" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "colors" TEXT[],
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StylingPalette_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylingItem" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "kind" "StylingItemKind" NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "imageDocId" TEXT,
    "priceRange" TEXT,
    "url" TEXT,
    "priority" "StylingItemPriority",
    "color" TEXT,
    "fit" TEXT,
    "recommendation" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StylingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylingEssential" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "category" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StylingEssential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylingBlueprintVersion" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "publishedById" TEXT NOT NULL,
    "pdfDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StylingBlueprintVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylingLibraryItem" (
    "id" TEXT NOT NULL,
    "kind" "StylingLibraryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "priceRange" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StylingLibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StylingBlueprint_clientId_key" ON "StylingBlueprint"("clientId");

-- CreateIndex
CREATE INDEX "StylingBlueprint_status_dueAt_idx" ON "StylingBlueprint"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "StylingPhoto_documentId_key" ON "StylingPhoto"("documentId");

-- CreateIndex
CREATE INDEX "StylingPhoto_blueprintId_slot_idx" ON "StylingPhoto"("blueprintId", "slot");

-- CreateIndex
CREATE INDEX "StylingLook_blueprintId_sortOrder_idx" ON "StylingLook"("blueprintId", "sortOrder");

-- CreateIndex
CREATE INDEX "StylingPalette_blueprintId_sortOrder_idx" ON "StylingPalette"("blueprintId", "sortOrder");

-- CreateIndex
CREATE INDEX "StylingItem_blueprintId_kind_sortOrder_idx" ON "StylingItem"("blueprintId", "kind", "sortOrder");

-- CreateIndex
CREATE INDEX "StylingEssential_blueprintId_sortOrder_idx" ON "StylingEssential"("blueprintId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StylingBlueprintVersion_blueprintId_version_key" ON "StylingBlueprintVersion"("blueprintId", "version");

-- CreateIndex
CREATE INDEX "StylingLibraryItem_kind_isActive_idx" ON "StylingLibraryItem"("kind", "isActive");

-- AddForeignKey
ALTER TABLE "StylingBlueprint" ADD CONSTRAINT "StylingBlueprint_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylingPhoto" ADD CONSTRAINT "StylingPhoto_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "StylingBlueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylingPhoto" ADD CONSTRAINT "StylingPhoto_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylingLook" ADD CONSTRAINT "StylingLook_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "StylingBlueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylingPalette" ADD CONSTRAINT "StylingPalette_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "StylingBlueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylingItem" ADD CONSTRAINT "StylingItem_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "StylingBlueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylingEssential" ADD CONSTRAINT "StylingEssential_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "StylingBlueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylingBlueprintVersion" ADD CONSTRAINT "StylingBlueprintVersion_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "StylingBlueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylingBlueprintVersion" ADD CONSTRAINT "StylingBlueprintVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylingLibraryItem" ADD CONSTRAINT "StylingLibraryItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every Groom To Be client who already has an active styling
-- consultant gets a Blueprint waiting for photos, pre-filled from their
-- onboarding assessment. (Glow To Be gets its own version later.)
INSERT INTO "StylingBlueprint" ("id", "clientId", "checkedEssentialIds", "styleTags", "barberBrief", "sectionsDone", "bodyType", "stylePreferences", "heightCm", "updatedAt")
SELECT gen_random_uuid()::text, c."id", '{}', '{}', '{}', '{}', a."bodyType",
       NULLIF(array_to_string(a."stylePreferences", ', '), ''), a."heightCm", CURRENT_TIMESTAMP
FROM "Client" c
LEFT JOIN "Assessment" a ON a."clientId" = c."id"
WHERE c."type" = 'groom' AND EXISTS (
  SELECT 1 FROM "Assignment" s
  WHERE s."clientId" = c."id" AND s."role" = 'styling_consultant' AND s."isActive" = true
);

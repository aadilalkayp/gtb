-- CreateEnum
CREATE TYPE "OutfitVerdict" AS ENUM ('great', 'good', 'avoid');

-- CreateEnum
CREATE TYPE "LookKind" AS ENUM ('hairstyle', 'beard');

-- CreateEnum
CREATE TYPE "LookStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "CoachRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "CoachCategory" AS ENUM ('skin', 'hair', 'beard', 'style', 'fitness', 'wedding', 'general');

-- CreateTable
CREATE TABLE "OutfitCheck" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "clientId" TEXT,
    "photoPaths" TEXT[],
    "modelVersion" TEXT,
    "results" JSONB,
    "palette" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutfitCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookPreview" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "clientId" TEXT,
    "kind" "LookKind" NOT NULL,
    "styleKey" TEXT NOT NULL,
    "status" "LookStatus" NOT NULL DEFAULT 'pending',
    "path" TEXT,
    "modelVersion" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LookPreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "CoachCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachConversation" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "CoachRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sources" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutfitCheck_scanId_idx" ON "OutfitCheck"("scanId");

-- CreateIndex
CREATE INDEX "OutfitCheck_clientId_createdAt_idx" ON "OutfitCheck"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "LookPreview_scanId_createdAt_idx" ON "LookPreview"("scanId", "createdAt");

-- CreateIndex
CREATE INDEX "LookPreview_clientId_createdAt_idx" ON "LookPreview"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "LookPreview_createdAt_idx" ON "LookPreview"("createdAt");

-- CreateIndex
CREATE INDEX "CoachArticle_category_isActive_idx" ON "CoachArticle"("category", "isActive");

-- CreateIndex
CREATE INDEX "CoachConversation_clientId_updatedAt_idx" ON "CoachConversation"("clientId", "updatedAt");

-- CreateIndex
CREATE INDEX "CoachConversation_scanId_idx" ON "CoachConversation"("scanId");

-- CreateIndex
CREATE INDEX "CoachMessage_conversationId_createdAt_idx" ON "CoachMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "OutfitCheck" ADD CONSTRAINT "OutfitCheck_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutfitCheck" ADD CONSTRAINT "OutfitCheck_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LookPreview" ADD CONSTRAINT "LookPreview_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LookPreview" ADD CONSTRAINT "LookPreview_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachConversation" ADD CONSTRAINT "CoachConversation_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachConversation" ADD CONSTRAINT "CoachConversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMessage" ADD CONSTRAINT "CoachMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CoachConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

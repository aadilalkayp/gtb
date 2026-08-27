-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'scored', 'failed');

-- CreateEnum
CREATE TYPE "RoadmapItemKind" AS ENUM ('weekly_focus', 'checklist');

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "photoPath" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "weddingDate" TIMESTAMP(3) NOT NULL,
    "type" "ClientType" NOT NULL DEFAULT 'groom',
    "status" "ScanStatus" NOT NULL DEFAULT 'pending',
    "modelVersion" TEXT,
    "failureReason" TEXT,
    "skinScore" INTEGER,
    "hairScore" INTEGER,
    "beardScore" INTEGER,
    "styleScore" INTEGER,
    "readinessScore" INTEGER,
    "focusAreas" JSONB,
    "highlights" TEXT[],
    "suggestions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapItem" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "RoadmapItemKind" NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "weekNumber" INTEGER,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Scan_clientId_createdAt_idx" ON "Scan"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Scan_status_createdAt_idx" ON "Scan"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RoadmapItem_clientId_dueDate_idx" ON "RoadmapItem"("clientId", "dueDate");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Team Pulse (TEAM_PULSE_DESIGN.md): audit-trail columns on ActivityLog and the
-- presence tables. Additive only; existing ActivityLog rows keep kind=change.

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('change', 'view', 'export', 'auth');

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "actorRole" "Role",
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "kind" "ActivityKind" NOT NULL DEFAULT 'change',
ADD COLUMN     "meta" JSONB,
ADD COLUMN     "module" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "verb" TEXT;

-- CreateTable
CREATE TABLE "StaffDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "activeMinutes" INTEGER NOT NULL DEFAULT 0,
    "changeCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StaffDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveMinute" (
    "userId" TEXT NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,
    "module" TEXT NOT NULL,

    CONSTRAINT "ActiveMinute_pkey" PRIMARY KEY ("userId","minute")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffDay_day_idx" ON "StaffDay"("day");

-- CreateIndex
CREATE UNIQUE INDEX "StaffDay_userId_day_key" ON "StaffDay"("userId", "day");

-- CreateIndex
CREATE INDEX "ActiveMinute_minute_idx" ON "ActiveMinute"("minute");

-- CreateIndex
CREATE INDEX "AuthSession_userId_firstSeenAt_idx" ON "AuthSession"("userId", "firstSeenAt");

-- CreateIndex
CREATE INDEX "ActivityLog_performedById_createdAt_idx" ON "ActivityLog"("performedById", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_clientId_createdAt_idx" ON "ActivityLog"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_requestId_idx" ON "ActivityLog"("requestId");

-- AddForeignKey
ALTER TABLE "StaffDay" ADD CONSTRAINT "StaffDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveMinute" ADD CONSTRAINT "ActiveMinute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Named domain events used lowercase entity names ("payment"); captured changes
-- use Prisma model names ("Payment"). Align the existing rows.
UPDATE "ActivityLog"
SET "entityType" = upper(left("entityType", 1)) || substring("entityType" from 2)
WHERE "entityType" ~ '^[a-z]';

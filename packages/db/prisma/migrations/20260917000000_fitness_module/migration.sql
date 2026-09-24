-- Fitness module (client sketches, Sep 2026): FitnessPlan + day-by-day
-- workout program, exercise prescriptions, weight/measurement time series,
-- weekly client check-ins, trainer notes, and the progress_photo document
-- type. Health/adherence/streaks are DERIVED (see @gtb/shared fitness.ts) —
-- nothing status-like is stored beyond completedAt timestamps.

-- CreateEnum
CREATE TYPE "FitnessPlanStatus" AS ENUM ('active', 'completed', 'cancelled');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'progress_photo';

-- CreateTable
CREATE TABLE "FitnessPlan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "trainerId" TEXT,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "templateKey" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "status" "FitnessPlanStatus" NOT NULL DEFAULT 'active',
    "startWeightKg" DOUBLE PRECISION,
    "targetWeightKg" DOUBLE PRECISION,
    "dietNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitnessPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitnessWorkoutDay" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "isRestDay" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FitnessWorkoutDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitnessExercise" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "sets" INTEGER,
    "reps" INTEGER,
    "durationSec" INTEGER,
    "equipment" TEXT,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FitnessExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyMeasurement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "chestCm" DOUBLE PRECISION,
    "waistCm" DOUBLE PRECISION,
    "hipsCm" DOUBLE PRECISION,
    "bicepCm" DOUBLE PRECISION,
    "thighCm" DOUBLE PRECISION,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitnessCheckIn" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "energyLevel" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "note" TEXT,
    "trainerComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitnessCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerNote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibleToClient" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FitnessPlan_clientId_status_idx" ON "FitnessPlan"("clientId", "status");

-- CreateIndex
CREATE INDEX "FitnessPlan_status_startDate_idx" ON "FitnessPlan"("status", "startDate");

-- CreateIndex
CREATE INDEX "FitnessWorkoutDay_date_idx" ON "FitnessWorkoutDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "FitnessWorkoutDay_planId_dayIndex_key" ON "FitnessWorkoutDay"("planId", "dayIndex");

-- CreateIndex
CREATE INDEX "FitnessExercise_dayId_idx" ON "FitnessExercise"("dayId");

-- CreateIndex
CREATE INDEX "WeightLog_clientId_date_idx" ON "WeightLog"("clientId", "date");

-- CreateIndex
CREATE INDEX "BodyMeasurement_clientId_date_idx" ON "BodyMeasurement"("clientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FitnessCheckIn_planId_weekNumber_key" ON "FitnessCheckIn"("planId", "weekNumber");

-- CreateIndex
CREATE INDEX "TrainerNote_clientId_createdAt_idx" ON "TrainerNote"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "FitnessPlan" ADD CONSTRAINT "FitnessPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitnessPlan" ADD CONSTRAINT "FitnessPlan_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitnessWorkoutDay" ADD CONSTRAINT "FitnessWorkoutDay_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FitnessPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitnessExercise" ADD CONSTRAINT "FitnessExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "FitnessWorkoutDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightLog" ADD CONSTRAINT "WeightLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightLog" ADD CONSTRAINT "WeightLog_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyMeasurement" ADD CONSTRAINT "BodyMeasurement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyMeasurement" ADD CONSTRAINT "BodyMeasurement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitnessCheckIn" ADD CONSTRAINT "FitnessCheckIn_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FitnessPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerNote" ADD CONSTRAINT "TrainerNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerNote" ADD CONSTRAINT "TrainerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


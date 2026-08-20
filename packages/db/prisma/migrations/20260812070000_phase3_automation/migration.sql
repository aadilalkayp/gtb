-- Phase 3 — automation layer (SYS-4 snapshot, DATA-2 reschedule history).
ALTER TABLE "ClientPlan" ADD COLUMN "servicesSnapshot" JSONB;
ALTER TABLE "Session" ADD COLUMN "originalScheduledDate" TIMESTAMP(3);

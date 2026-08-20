-- Phase 7 — FEAT-10: dedicated expense rejection reason (never overwrites submitter notes).
ALTER TABLE "Expense" ADD COLUMN "rejectionReason" TEXT;

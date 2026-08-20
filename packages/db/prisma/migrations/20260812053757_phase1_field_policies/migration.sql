-- Phase 1 — field-level write-access hardening.
--
-- The ZenStack field-level policies live in schema.zmodel (metadata only — no
-- DDL). This migration adds the DB-side backstops that policies cannot express:
--
-- 1. Session.rating is bounded to 1-5 (SEC-4). The gateway cannot express a
--    range check in a policy, so the database enforces it.
--
-- 2. Only one active Assignment per (client, role) (STATE-4 backstop, part 1 of
--    the Phase 2 unique-constraint work is intentionally NOT here — STATE-4 is
--    handled in its own Phase 2 migration. This migration is Phase 1 only.)

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_rating_range" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5));

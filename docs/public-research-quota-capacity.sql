-- Apply as owner of the existing dedicated research database before raising
-- EARMARK_RESEARCH_GLOBAL_DAILY_LIMIT above 24. The original CREATE TABLE
-- assigns daily_quota_used_check to the used BETWEEN 1 AND 24 constraint.
-- A lock timeout or unexpected schema rolls back the entire migration.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE earmark_research.daily_quota
  DROP CONSTRAINT daily_quota_used_check,
  ADD CONSTRAINT daily_quota_used_check CHECK (used BETWEEN 1 AND 120);

COMMIT;

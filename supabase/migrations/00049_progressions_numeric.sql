-- 00049_progressions_numeric.sql
-- The Eduvia API returns decimal values for progression_percentage (e.g. 15.8),
-- estimated_relative_time and average_score, but migration 00045 declared these
-- columns INTEGER. Widen them to NUMERIC(10,2) so the sync stops rejecting rows.

ALTER TABLE contrats_progressions
  ALTER COLUMN progression_percentage TYPE NUMERIC(6,2),
  ALTER COLUMN estimated_relative_time TYPE NUMERIC(10,2),
  ALTER COLUMN average_score TYPE NUMERIC(6,2);

-- 00045_contrats_progressions.sql
-- Per-contract training progression snapshot pulled from Eduvia.
-- One row per contract, upserted on each sync. Sequences are stored
-- as JSONB to keep the schema flexible while still allowing SQL
-- aggregates on the top-level metrics (progression_percentage,
-- total_spent_time_hours, etc.).

CREATE TABLE IF NOT EXISTS contrats_progressions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id                 UUID UNIQUE NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
  eduvia_contract_id         INTEGER NOT NULL,
  eduvia_formation_id        INTEGER,
  total_spent_time_seconds   INTEGER,
  total_spent_time_hours     NUMERIC(10,2),
  completed_sequences_count  INTEGER,
  sequence_count             INTEGER,
  progression_percentage     INTEGER,
  estimated_relative_time    INTEGER,
  average_score              INTEGER,
  last_activity_at           TIMESTAMPTZ,
  sequences                  JSONB,
  last_synced_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contrats_progressions_contrat_id
  ON contrats_progressions(contrat_id);

ALTER TABLE contrats_progressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY contrats_progressions_select ON contrats_progressions
  FOR SELECT USING (
    contrat_id IN (SELECT id FROM contrats)
  );

CREATE POLICY contrats_progressions_admin_all ON contrats_progressions
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role::text IN ('admin', 'superadmin'))
  );

COMMENT ON TABLE contrats_progressions IS 'Per-contract progression snapshot pulled from Eduvia /contracts/{id}/progressions. Upserted on each sync (one row per contract).';
COMMENT ON COLUMN contrats_progressions.total_spent_time_seconds IS 'Raw seconds from the API. total_spent_time_hours is the convenience duplicate.';
COMMENT ON COLUMN contrats_progressions.sequences IS 'Array of per-sequence score objects; shape kept as JSONB for forward-compatibility.';

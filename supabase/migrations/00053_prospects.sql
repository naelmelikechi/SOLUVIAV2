-- Pipeline commercial: prospects (CFA + entreprises) et leurs notes
CREATE TYPE type_prospect AS ENUM ('cfa', 'entreprise');
CREATE TYPE stage_prospect AS ENUM ('non_contacte', 'r1', 'r2', 'signe');

CREATE TABLE prospects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_prospect       type_prospect NOT NULL,
  nom                 TEXT NOT NULL,
  region              TEXT,
  siret               TEXT,
  volume_apprenants   INTEGER,
  dirigeant_nom       TEXT,
  dirigeant_email     TEXT,
  dirigeant_telephone TEXT,
  dirigeant_poste     TEXT,
  site_web            TEXT,
  emails_generiques   TEXT,
  telephone_standard  TEXT,
  notes_import        TEXT,
  stage               stage_prospect NOT NULL DEFAULT 'non_contacte',
  commercial_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  client_id           UUID REFERENCES clients(id) ON DELETE SET NULL,
  archive             BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_prospects_siret_unique
  ON prospects(siret) WHERE siret IS NOT NULL;
CREATE INDEX idx_prospects_stage ON prospects(stage);
CREATE INDEX idx_prospects_commercial ON prospects(commercial_id);
CREATE INDEX idx_prospects_type ON prospects(type_prospect);
CREATE INDEX idx_prospects_archive ON prospects(archive);

CREATE TRIGGER trg_prospects_updated
  BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE prospect_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  contenu     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prospect_notes_prospect ON prospect_notes(prospect_id);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_notes ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY admin_all_prospects ON prospects FOR ALL USING (is_admin());
CREATE POLICY admin_all_prospect_notes ON prospect_notes FOR ALL USING (is_admin());

-- Commercial: read all prospects, insert/update (assignment handled at app level)
CREATE POLICY commercial_read_prospects ON prospects FOR SELECT
  USING (is_commercial());
CREATE POLICY commercial_update_prospects ON prospects FOR UPDATE
  USING (is_commercial());
CREATE POLICY commercial_insert_prospects ON prospects FOR INSERT
  WITH CHECK (is_commercial());

-- Commercial: read all notes, insert own
CREATE POLICY commercial_read_prospect_notes ON prospect_notes FOR SELECT
  USING (is_commercial());
CREATE POLICY commercial_insert_prospect_notes ON prospect_notes FOR INSERT
  WITH CHECK (is_commercial() AND user_id = auth.uid());

-- Pipeline access as an attribute (not a role)
-- The 'commercial' role in role_utilisateur enum (added in 00052) becomes dormant;
-- we keep the value because Postgres does not support DROP VALUE without recreating
-- the enum and updating every referencing column/constraint.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pipeline_access BOOLEAN NOT NULL DEFAULT false;

-- Helper: admin OR explicit flag
CREATE OR REPLACE FUNCTION has_pipeline_access()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (role = 'admin' OR role = 'superadmin' OR pipeline_access = true)
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Rewrite pipeline RLS: replace commercial-based policies with attribute-based ones.
-- Admin policies (admin_all_*) stay as they are; is_commercial() policies get replaced.

DROP POLICY IF EXISTS commercial_read_prospects ON prospects;
DROP POLICY IF EXISTS commercial_update_prospects ON prospects;
DROP POLICY IF EXISTS commercial_insert_prospects ON prospects;
DROP POLICY IF EXISTS commercial_read_prospect_notes ON prospect_notes;
DROP POLICY IF EXISTS commercial_insert_prospect_notes ON prospect_notes;

CREATE POLICY pipeline_read_prospects ON prospects FOR SELECT
  USING (has_pipeline_access());
CREATE POLICY pipeline_update_prospects ON prospects FOR UPDATE
  USING (has_pipeline_access());
CREATE POLICY pipeline_insert_prospects ON prospects FOR INSERT
  WITH CHECK (has_pipeline_access());

CREATE POLICY pipeline_read_prospect_notes ON prospect_notes FOR SELECT
  USING (has_pipeline_access());
CREATE POLICY pipeline_insert_prospect_notes ON prospect_notes FOR INSERT
  WITH CHECK (has_pipeline_access() AND user_id = auth.uid());

-- is_commercial() is no longer referenced by policies but is left in place as
-- a trivial helper — dropping it requires no dependencies check and can be done
-- in a later cleanup migration.

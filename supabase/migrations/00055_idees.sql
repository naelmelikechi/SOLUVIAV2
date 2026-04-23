-- Boîte à idées : proposition, validation, implémentation d'améliorations
-- (Eduvia, Soluvia, workflow). Les permissions de validation et d'implémentation
-- sont exposées comme 2 attributs sur users (pattern `pipeline_access`).

-- Permissions attachables
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_validate_ideas BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_ship_ideas BOOLEAN NOT NULL DEFAULT false;

-- Helpers RLS (préfixe `has_` pour distinguer des noms de colonnes)
CREATE OR REPLACE FUNCTION has_validate_ideas_access()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (role = 'admin' OR role = 'superadmin' OR can_validate_ideas = true)
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_ship_ideas_access()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (role = 'admin' OR role = 'superadmin' OR can_ship_ideas = true)
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Enums
CREATE TYPE statut_idee AS ENUM ('proposee', 'validee', 'implementee', 'rejetee');
CREATE TYPE cible_idee AS ENUM ('eduvia', 'soluvia', 'workflow', 'autre');

-- Table idees
CREATE TABLE idees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auteur_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titre             TEXT NOT NULL,
  description       TEXT,
  cible             cible_idee NOT NULL DEFAULT 'autre',
  statut            statut_idee NOT NULL DEFAULT 'proposee',
  validee_par       UUID REFERENCES users(id) ON DELETE SET NULL,
  validee_at        TIMESTAMPTZ,
  implementee_par   UUID REFERENCES users(id) ON DELETE SET NULL,
  implementee_at    TIMESTAMPTZ,
  rejet_motif       TEXT,
  archive           BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idees_statut ON idees(statut);
CREATE INDEX idx_idees_auteur ON idees(auteur_id);
CREATE INDEX idx_idees_created ON idees(created_at DESC);
CREATE INDEX idx_idees_validee_at ON idees(validee_at DESC) WHERE validee_at IS NOT NULL;
CREATE INDEX idx_idees_implementee_at ON idees(implementee_at DESC) WHERE implementee_at IS NOT NULL;

CREATE TRIGGER trg_idees_updated
  BEFORE UPDATE ON idees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE idees ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY admin_all_idees ON idees FOR ALL USING (is_admin());

-- Tous les users authentifiés peuvent lire toutes les idées (transparence équipe)
CREATE POLICY auth_read_idees ON idees FOR SELECT TO authenticated USING (true);

-- Tous peuvent proposer une idée (insert) en leur nom, en statut 'proposee'
CREATE POLICY auth_propose_idees ON idees FOR INSERT TO authenticated
  WITH CHECK (auteur_id = auth.uid() AND statut = 'proposee');

-- L'auteur peut modifier sa propre idée tant qu'elle est en 'proposee'
CREATE POLICY author_edit_own_proposed ON idees FOR UPDATE TO authenticated
  USING (auteur_id = auth.uid() AND statut = 'proposee');

-- Validateurs peuvent mettre à jour n'importe quelle idée (logique metier côté action)
CREATE POLICY validators_update_idees ON idees FOR UPDATE
  USING (has_validate_ideas_access());

-- Shippers peuvent mettre à jour n'importe quelle idée (logique metier côté action)
CREATE POLICY shippers_update_idees ON idees FOR UPDATE
  USING (has_ship_ideas_access());

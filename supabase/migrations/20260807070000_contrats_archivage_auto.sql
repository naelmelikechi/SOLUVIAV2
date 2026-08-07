-- Archivage automatique des contrats restes en brouillon.
--
-- Probleme resolu en premier : rien ne disait DEPUIS QUAND un contrat est dans
-- son etat. `updated_at` ne pouvait pas servir, la synchronisation Eduvia
-- tourne toutes les heures et le rafraichit ; une regle "NOTSENT depuis plus
-- de 30 jours" ne se serait jamais declenchee.

-- ---------------------------------------------------------------------------
-- Datation des changements d'etat
-- ---------------------------------------------------------------------------

ALTER TABLE contrats
  ADD COLUMN IF NOT EXISTS contract_state_changed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION set_contrat_state_changed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.contract_state_changed_at := COALESCE(NEW.contract_state_changed_at, now());
  ELSIF NEW.contract_state IS DISTINCT FROM OLD.contract_state THEN
    NEW.contract_state_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrat_state_changed_at ON contrats;

CREATE TRIGGER trg_contrat_state_changed_at
  BEFORE INSERT OR UPDATE ON contrats
  FOR EACH ROW EXECUTE FUNCTION set_contrat_state_changed_at();

-- Backfill : created_at est le seul indice disponible pour les lignes
-- existantes. Approximation assumee et documentee - pour un contrat reste en
-- NOTSENT depuis sa creation, c'est meme la valeur exacte.
UPDATE contrats
   SET contract_state_changed_at = created_at
 WHERE contract_state_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contrats_state_changed_at
  ON contrats (contract_state, contract_state_changed_at)
  WHERE archive = false;

-- ---------------------------------------------------------------------------
-- Regles d'archivage, editables sans redeploiement
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contrats_regles_archivage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  etat_source TEXT NOT NULL,
  delai_jours INTEGER NOT NULL CHECK (delai_jours > 0),
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id),
  UNIQUE (etat_source)
);

CREATE TRIGGER trg_regles_archivage_updated_at
  BEFORE UPDATE ON contrats_regles_archivage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE contrats_regles_archivage ENABLE ROW LEVEL SECURITY;

-- Reservees aux admins : une regle mal reglee sort du chiffre de la
-- production. Une seule policy permissive par commande, initplan-wrap.
CREATE POLICY regles_archivage_select ON contrats_regles_archivage
  FOR SELECT USING ((SELECT is_admin()));
CREATE POLICY regles_archivage_insert ON contrats_regles_archivage
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY regles_archivage_update ON contrats_regles_archivage
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY regles_archivage_delete ON contrats_regles_archivage
  FOR DELETE USING (is_admin());

-- ---------------------------------------------------------------------------
-- Tracabilite de l'archivage automatique
-- ---------------------------------------------------------------------------
-- Sans ces deux colonnes, un contrat archive par le cron serait indiscernable
-- d'un contrat archive a la main : impossible de repondre a "pourquoi celui-la
-- a disparu de ma production ?", ni de desarchiver en connaissance de cause.

ALTER TABLE contrats
  ADD COLUMN IF NOT EXISTS archive_auto_le   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_regle_id  UUID REFERENCES contrats_regles_archivage(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contrats_archive_regle_id
  ON contrats (archive_regle_id);

-- ---------------------------------------------------------------------------
-- Regle de depart : celle du brief
-- ---------------------------------------------------------------------------

INSERT INTO contrats_regles_archivage (nom, etat_source, delai_jours, actif)
VALUES (
  'Brouillon jamais transmis',
  'NOTSENT',
  30,
  true
)
ON CONFLICT (etat_source) DO NOTHING;

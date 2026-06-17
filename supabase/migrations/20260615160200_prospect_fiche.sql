-- Fiche prospect V2 : interlocuteurs multiples, identité INSEE, onglet
-- négociation, contact principal, fraîcheur d'activité (indicateur santé),
-- détection de doublons par similarité de raison sociale.

-- 1. Enums (CREATE TYPE = valeurs utilisables immédiatement dans la même tx,
--    contrairement à ALTER TYPE ADD VALUE).
CREATE TYPE canal_origine AS ENUM (
  'reseau_developpeur',
  'reseau_direction',
  'linkedin_auto',
  'salon',
  'apporteur',
  'autre'
);
CREATE TYPE role_decision_contact AS ENUM (
  'signataire',
  'sponsor',
  'operationnel',
  'soutien'
);

-- 2. Interlocuteurs du prospect (modèle calqué sur client_contacts, 00004).
CREATE TABLE prospect_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id   UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL,
  poste         TEXT,
  email         TEXT,
  telephone     TEXT,
  role_decision role_decision_contact,
  sensibilites  TEXT,
  linkedin      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prospect_contacts_prospect ON prospect_contacts(prospect_id);

ALTER TABLE prospect_contacts ENABLE ROW LEVEL SECURITY;

-- RLS : même contrat que prospects (lot3) — lecture/écriture pipeline, delete
-- ouvert au pipeline (les interlocuteurs ne sont pas des données sensibles
-- comme les prospects eux-mêmes). is_admin() hoisté en InitPlan sur SELECT.
CREATE POLICY prospect_contacts_select ON prospect_contacts FOR SELECT TO public
  USING (((SELECT is_admin()) OR has_pipeline_access()));
CREATE POLICY prospect_contacts_insert ON prospect_contacts FOR INSERT TO public
  WITH CHECK ((is_admin() OR has_pipeline_access()));
CREATE POLICY prospect_contacts_update ON prospect_contacts FOR UPDATE TO public
  USING ((is_admin() OR has_pipeline_access()));
CREATE POLICY prospect_contacts_delete ON prospect_contacts FOR DELETE TO public
  USING ((is_admin() OR has_pipeline_access()));

-- 3. Nouvelles colonnes prospects.
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS canal_origine        canal_origine,
  ADD COLUMN IF NOT EXISTS contact_principal_id UUID REFERENCES prospect_contacts(id) ON DELETE SET NULL,
  -- Fraîcheur d'activité : alimente l'indicateur santé 🟢🟠🔴 (Feature 1 §5).
  ADD COLUMN IF NOT EXISTS derniere_action_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Identité INSEE (siren = 9 chiffres ; la colonne siret existante reste pour
  -- l'import Excel historique).
  ADD COLUMN IF NOT EXISTS siren                TEXT,
  ADD COLUMN IF NOT EXISTS forme_juridique      TEXT,
  ADD COLUMN IF NOT EXISTS code_naf             TEXT,
  ADD COLUMN IF NOT EXISTS naf_libelle          TEXT,
  ADD COLUMN IF NOT EXISTS effectif_tranche     TEXT,
  ADD COLUMN IF NOT EXISTS adresse              TEXT,
  ADD COLUMN IF NOT EXISTS insee_verifie        BOOLEAN NOT NULL DEFAULT false,
  -- Onglet négociation (Feature 2 §5).
  ADD COLUMN IF NOT EXISTS taux_npec            NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS duree_contrat_ans    INTEGER,
  ADD COLUMN IF NOT EXISTS mois_demarrage       INTEGER,
  ADD COLUMN IF NOT EXISTS volume_an1           INTEGER,
  ADD COLUMN IF NOT EXISTS volume_an2           INTEGER,
  ADD COLUMN IF NOT EXISTS volume_an3           INTEGER,
  ADD COLUMN IF NOT EXISTS volume_garanti_seuil INTEGER,
  ADD COLUMN IF NOT EXISTS leviers              JSONB,
  ADD COLUMN IF NOT EXISTS perimetre_missions   TEXT,
  -- Verrouillage à la signature (Feature 2 §8 / Feature 6) : ces 2 champs
  -- restent éditables après bascule en Client.
  ADD COLUMN IF NOT EXISTS points_vigilance     TEXT,
  ADD COLUMN IF NOT EXISTS notes_inter_equipe   TEXT;

CREATE INDEX IF NOT EXISTS idx_prospects_derniere_action ON prospects(derniere_action_at);
CREATE INDEX IF NOT EXISTS idx_prospects_canal ON prospects(canal_origine);

-- 4. Détection de doublons par similarité de raison sociale (pg_trgm est déjà
--    activé, schema extensions — cf. 00001 + 20260511223837). gin_trgm_ops nu
--    fonctionne (search_path inclut extensions, cf. idx bank_lines 20260526120200).
CREATE INDEX IF NOT EXISTS idx_prospects_nom_trgm
  ON prospects USING gin (nom gin_trgm_ops);

-- 5. Fraîcheur d'activité : tout évènement commercial rafraîchit derniere_action_at.
CREATE OR REPLACE FUNCTION bump_prospect_derniere_action()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE prospects SET derniere_action_at = now() WHERE id = NEW.prospect_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_prospect_note_bump
  AFTER INSERT ON prospect_notes
  FOR EACH ROW EXECUTE FUNCTION bump_prospect_derniere_action();

CREATE TRIGGER trg_prospect_rdv_bump
  AFTER INSERT OR UPDATE ON rdv_commerciaux
  FOR EACH ROW EXECUTE FUNCTION bump_prospect_derniere_action();

CREATE TRIGGER trg_prospect_contact_bump
  AFTER INSERT ON prospect_contacts
  FOR EACH ROW EXECUTE FUNCTION bump_prospect_derniere_action();

-- Changement d'étape = action : on rafraîchit dans la même UPDATE (BEFORE).
CREATE OR REPLACE FUNCTION touch_prospect_on_stage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.derniere_action_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prospect_stage_touch
  BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION touch_prospect_on_stage();

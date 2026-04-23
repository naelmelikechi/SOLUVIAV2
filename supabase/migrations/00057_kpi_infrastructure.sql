-- Wave 2 : Infrastructure pour les KPIs de progression
-- - RDV formateurs (CDP scope) + RDV commerciaux (pipeline scope)
-- - Apporteur commercial sur clients (chaine pour "apprenants apportés")
-- - Date de réalisation sur tâches qualité (pour KPI hebdo)
-- - Snapshots hebdomadaires de progression apprenants

-- 1. Statut commun pour les RDV
CREATE TYPE statut_rdv AS ENUM ('prevu', 'realise', 'annule');

-- 2. RDV avec formateurs (liés à un projet CFA)
CREATE TABLE rdv_formateurs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id      UUID NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  formateur_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  formateur_nom  TEXT,
  cdp_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  date_prevue    DATE NOT NULL,
  date_realisee  DATE,
  statut         statut_rdv NOT NULL DEFAULT 'prevu',
  objet          TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rdv_formateurs_projet ON rdv_formateurs(projet_id);
CREATE INDEX idx_rdv_formateurs_cdp ON rdv_formateurs(cdp_id);
CREATE INDEX idx_rdv_formateurs_date_prevue ON rdv_formateurs(date_prevue);
CREATE INDEX idx_rdv_formateurs_statut ON rdv_formateurs(statut);

CREATE TRIGGER trg_rdv_formateurs_updated
  BEFORE UPDATE ON rdv_formateurs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE rdv_formateurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_rdv_formateurs ON rdv_formateurs FOR ALL USING (is_admin());
CREATE POLICY cdp_read_rdv_formateurs ON rdv_formateurs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = rdv_formateurs.projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));
CREATE POLICY cdp_write_rdv_formateurs ON rdv_formateurs FOR ALL
  USING (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = rdv_formateurs.projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

-- 3. RDV commerciaux (liés à un prospect)
CREATE TABLE rdv_commerciaux (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id   UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  commercial_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_prevue   DATE NOT NULL,
  date_realisee DATE,
  statut        statut_rdv NOT NULL DEFAULT 'prevu',
  objet         TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rdv_commerciaux_prospect ON rdv_commerciaux(prospect_id);
CREATE INDEX idx_rdv_commerciaux_commercial ON rdv_commerciaux(commercial_id);
CREATE INDEX idx_rdv_commerciaux_date_prevue ON rdv_commerciaux(date_prevue);
CREATE INDEX idx_rdv_commerciaux_statut ON rdv_commerciaux(statut);

CREATE TRIGGER trg_rdv_commerciaux_updated
  BEFORE UPDATE ON rdv_commerciaux
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE rdv_commerciaux ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_rdv_commerciaux ON rdv_commerciaux FOR ALL USING (is_admin());
CREATE POLICY pipeline_read_rdv_commerciaux ON rdv_commerciaux FOR SELECT
  USING (has_pipeline_access());
CREATE POLICY pipeline_write_rdv_commerciaux ON rdv_commerciaux FOR ALL
  USING (has_pipeline_access())
  WITH CHECK (has_pipeline_access() AND commercial_id = auth.uid());

-- 4. Apporteur commercial sur clients (chaine commercial → prospect → client → projet → apprenants)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS apporteur_commercial_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS apporteur_date DATE;

CREATE INDEX IF NOT EXISTS idx_clients_apporteur ON clients(apporteur_commercial_id);

-- 5. Date de réalisation sur tâches qualité (complément de `fait BOOLEAN`)
ALTER TABLE taches_qualite
  ADD COLUMN IF NOT EXISTS date_realisation TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_taches_qualite_date_realisation ON taches_qualite(date_realisation);

-- Trigger: quand `fait` passe de false à true, on stamp date_realisation automatiquement
CREATE OR REPLACE FUNCTION stamp_tache_qualite_realisation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fait IS TRUE AND (OLD.fait IS FALSE OR OLD.fait IS NULL) AND NEW.date_realisation IS NULL THEN
    NEW.date_realisation := now();
  ELSIF NEW.fait IS FALSE AND OLD.fait IS TRUE THEN
    NEW.date_realisation := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tache_qualite_stamp_realisation ON taches_qualite;
CREATE TRIGGER trg_tache_qualite_stamp_realisation
  BEFORE UPDATE ON taches_qualite
  FOR EACH ROW EXECUTE FUNCTION stamp_tache_qualite_realisation();

-- 6. Snapshots hebdomadaires de progression apprenants
-- Granularité : 1 ligne par contrat et par "lundi" ISO (semaine)
CREATE TABLE progression_snapshots_weekly (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id              UUID NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
  semaine_debut           DATE NOT NULL, -- lundi ISO
  progression_percentage  NUMERIC(5,2) NOT NULL,
  completed_sequences     INTEGER,
  total_spent_time_hours  NUMERIC(7,2),
  captured_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contrat_id, semaine_debut)
);

CREATE INDEX idx_progression_snapshots_semaine ON progression_snapshots_weekly(semaine_debut);
CREATE INDEX idx_progression_snapshots_contrat ON progression_snapshots_weekly(contrat_id);

ALTER TABLE progression_snapshots_weekly ENABLE ROW LEVEL SECURITY;

-- Admin lit/ecrit, CDP lit pour ses projets
CREATE POLICY admin_all_progression_snapshots ON progression_snapshots_weekly FOR ALL USING (is_admin());
CREATE POLICY cdp_read_progression_snapshots ON progression_snapshots_weekly FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM contrats c
    JOIN projets p ON p.id = c.projet_id
    WHERE c.id = progression_snapshots_weekly.contrat_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

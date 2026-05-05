-- Refonte des jalons de facturation : templates configurables + override
-- par projet + snapshot NPEC + table d'ajustements en attente.
-- Cf plan /Users/nael/.claude/plans/scalable-giggling-blum.md

-- ---------------------------------------------------------------------------
-- 1. Table echeanciers_templates : templates nommes reutilisables
-- ---------------------------------------------------------------------------

CREATE TABLE echeanciers_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom          TEXT NOT NULL UNIQUE,
  description  TEXT,
  -- jalons : tableau de { mois_relatif: int, quote_part: numeric, label?: string }
  -- mois_relatif = M+x du contrat (relatif a contrat.date_debut)
  -- quote_part = fraction de (NPEC × taux_commission/100). Sum typiquement = 1.0
  jalons       JSONB NOT NULL,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  archive      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un seul template marquable comme defaut
CREATE UNIQUE INDEX uq_echeanciers_templates_default
  ON echeanciers_templates (is_default) WHERE is_default = true;

CREATE TRIGGER trg_echeanciers_templates_updated
  BEFORE UPDATE ON echeanciers_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Modification table projets : reference template + override JSONB
-- ---------------------------------------------------------------------------

ALTER TABLE projets
  ADD COLUMN echeancier_template_id UUID REFERENCES echeanciers_templates(id),
  ADD COLUMN echeancier_override JSONB;
-- Resolution : echeancier_override > echeancier_template_id > template global default
COMMENT ON COLUMN projets.echeancier_template_id IS
  'Template d''echeancier applique au projet. NULL = template global is_default=true.';
COMMENT ON COLUMN projets.echeancier_override IS
  'Override JSONB local. Si non NULL, surcharge le template_id.';

-- ---------------------------------------------------------------------------
-- 3. Modification table echeances : tracabilite jalon + snapshot NPEC
-- ---------------------------------------------------------------------------

ALTER TABLE echeances
  ADD COLUMN mois_relatif INTEGER,
  ADD COLUMN quote_part NUMERIC(6,4),
  ADD COLUMN npec_snapshot NUMERIC(12,2);
COMMENT ON COLUMN echeances.mois_relatif IS
  'Mois M+x du contrat principal contributeur (debug et regroupement).';
COMMENT ON COLUMN echeances.npec_snapshot IS
  'Somme NPEC des contrats au moment ou le montant_prevu_ht a ete fige.';

-- ---------------------------------------------------------------------------
-- 4. Modification table facture_lignes : tracabilite jalon par contrat
-- ---------------------------------------------------------------------------

ALTER TABLE facture_lignes
  ADD COLUMN mois_relatif INTEGER,
  ADD COLUMN quote_part NUMERIC(6,4),
  ADD COLUMN npec_snapshot NUMERIC(12,2),
  ADD COLUMN taux_commission_snapshot NUMERIC(5,2);
COMMENT ON COLUMN facture_lignes.npec_snapshot IS
  'NPEC du contrat au moment de l''emission. Sert au recompute en cas de changement NPEC ulterieur.';
COMMENT ON COLUMN facture_lignes.taux_commission_snapshot IS
  'Taux de commission projet au moment de l''emission.';

-- ---------------------------------------------------------------------------
-- 5. Table facturation_ajustements_pending : ajustements en attente de validation
-- ---------------------------------------------------------------------------

CREATE TABLE facturation_ajustements_pending (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id       UUID REFERENCES projets(id) ON DELETE CASCADE,
  contrat_id      UUID REFERENCES contrats(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('npec_change', 'rupture')),
  -- delta_ht > 0 : SOLUVIA doit emettre une facture complementaire
  -- delta_ht < 0 : SOLUVIA doit emettre un avoir
  delta_ht        NUMERIC(12,2) NOT NULL,
  motif           TEXT,
  -- detail : breakdown contribution par facture deja emise
  -- ex: [{facture_ref:"FAC-XXX-0001", facture_id:"...", delta_ligne_ht:50.00, ...}]
  detail          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_action TEXT CHECK (resolved_action IN ('emitted', 'ignored')),
  resolved_by     UUID REFERENCES users(id),
  -- Si resolved_action = 'emitted' : reference la facture/avoir emis
  resolved_facture_id UUID REFERENCES factures(id)
);

CREATE INDEX idx_ajustements_pending_unresolved
  ON facturation_ajustements_pending (created_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX idx_ajustements_pending_contrat
  ON facturation_ajustements_pending (contrat_id);

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE echeanciers_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturation_ajustements_pending ENABLE ROW LEVEL SECURITY;

-- Templates : admin tout, CDP/autres peuvent lire (besoin d'afficher le nom dans l'UI projet)
CREATE POLICY admin_all_echeanciers_templates ON echeanciers_templates
  FOR ALL USING (is_admin());
CREATE POLICY all_select_echeanciers_templates ON echeanciers_templates
  FOR SELECT USING (true);

-- Ajustements : admin tout, CDP voit ceux de ses projets
CREATE POLICY admin_all_ajustements_pending ON facturation_ajustements_pending
  FOR ALL USING (is_admin());
CREATE POLICY cdp_select_ajustements_pending ON facturation_ajustements_pending
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projets p
      WHERE p.id = facturation_ajustements_pending.projet_id
        AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
        AND p.archive = false
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Seed : 2 templates de base
-- ---------------------------------------------------------------------------

INSERT INTO echeanciers_templates (nom, description, jalons, is_default) VALUES
  (
    'Standard 3/12 + 1/12',
    'Rattrapage 3/12 au M+3, puis 1/12 par mois jusqu''a M+12. Total 100%.',
    '[
      {"mois_relatif": 3, "quote_part": 0.25, "label": "Rattrapage M1-M3"},
      {"mois_relatif": 4, "quote_part": 0.0833},
      {"mois_relatif": 5, "quote_part": 0.0833},
      {"mois_relatif": 6, "quote_part": 0.0833},
      {"mois_relatif": 7, "quote_part": 0.0833},
      {"mois_relatif": 8, "quote_part": 0.0833},
      {"mois_relatif": 9, "quote_part": 0.0833},
      {"mois_relatif": 10, "quote_part": 0.0833},
      {"mois_relatif": 11, "quote_part": 0.0833},
      {"mois_relatif": 12, "quote_part": 0.0836}
    ]'::jsonb,
    true
  ),
  (
    'Legacy M+2 a M+10',
    'Ancien schema : mensuel M+2 a M+9 + balloon x3 au M+10. Conserve pour les projets existants en cours de facturation.',
    '[
      {"mois_relatif": 2, "quote_part": 0.0833},
      {"mois_relatif": 3, "quote_part": 0.0833},
      {"mois_relatif": 4, "quote_part": 0.0833},
      {"mois_relatif": 5, "quote_part": 0.0833},
      {"mois_relatif": 6, "quote_part": 0.0833},
      {"mois_relatif": 7, "quote_part": 0.0833},
      {"mois_relatif": 8, "quote_part": 0.0833},
      {"mois_relatif": 9, "quote_part": 0.0833},
      {"mois_relatif": 10, "quote_part": 0.25, "label": "Balloon M10-M12"}
    ]'::jsonb,
    false
  );

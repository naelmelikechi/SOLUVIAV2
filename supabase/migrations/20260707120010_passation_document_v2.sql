-- Passation V2 — découplage de `prospects` (le chantier CRM Phase 2 supprimera
-- prospects/signature_requests : la synthèse doit survivre), saisies du
-- Développeur portées par le document (sections 6 + 8, jamais dans le snapshot
-- `contenu`), échéances 18h/48h idempotentes, lecture RLS pour le CDP affecté.

-- 1. Survie au DROP prospects : prospect_id nullable + SET NULL, ancrage client.
ALTER TABLE document_synthese ALTER COLUMN prospect_id DROP NOT NULL;
ALTER TABLE document_synthese
  DROP CONSTRAINT IF EXISTS document_synthese_prospect_id_fkey;
ALTER TABLE document_synthese
  ADD CONSTRAINT document_synthese_prospect_id_fkey
    FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE SET NULL;

ALTER TABLE document_synthese
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  -- Dénormalisé : listing/emails sans parser le JSONB contenu.
  ADD COLUMN IF NOT EXISTS reference_dossier TEXT,
  -- Section 6 (champ libre Développeur).
  ADD COLUMN IF NOT EXISTS points_vigilance TEXT,
  ADD COLUMN IF NOT EXISTS promesses_orales TEXT,
  -- Section 8 (recommandation, structurée — masquée au CDP affecté).
  ADD COLUMN IF NOT EXISTS typologie_client typologie_client,
  ADD COLUMN IF NOT EXISTS charge_previsionnelle niveau_charge,
  ADD COLUMN IF NOT EXISTS risque_churn niveau_risque,
  ADD COLUMN IF NOT EXISTS cdp_ideal TEXT,
  ADD COLUMN IF NOT EXISTS cdp_a_eviter TEXT,
  ADD COLUMN IF NOT EXISTS notes_inter_equipe TEXT,
  -- Workflow : ancre des délais 48h (survit au DROP signature_requests) +
  -- soumission au Référent CDP.
  ADD COLUMN IF NOT EXISTS signature_signee_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS soumise_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS soumise_par UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Idempotence du cron d'échéances (pattern devis relance_j7_envoyee_at).
  ADD COLUMN IF NOT EXISTS rappel_dev_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalade_dev_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rappel_referent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalade_direction_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_document_synthese_client
  ON document_synthese(client_id);
CREATE INDEX IF NOT EXISTS idx_document_synthese_statut
  ON document_synthese(statut);
CREATE INDEX IF NOT EXISTS idx_document_synthese_soumise_par
  ON document_synthese(soumise_par);

-- 2. Backfill depuis les tables encore présentes.
UPDATE document_synthese ds
   SET client_id          = COALESCE(ds.client_id, p.client_id),
       points_vigilance   = COALESCE(ds.points_vigilance, p.points_vigilance),
       notes_inter_equipe = COALESCE(ds.notes_inter_equipe, p.notes_inter_equipe)
  FROM prospects p
 WHERE ds.prospect_id = p.id;

UPDATE document_synthese ds
   SET signature_signee_at = sr.signed_at
  FROM signature_requests sr
 WHERE ds.signature_id = sr.id
   AND sr.signed_at IS NOT NULL
   AND ds.signature_signee_at IS NULL;

-- Mapping des statuts legacy vers la machine à états spec F6.
UPDATE document_synthese SET statut = 'en_attente_arbitrage'
 WHERE statut = 'diffusee_vague1';
UPDATE document_synthese SET statut = 'cdp_affecte'
 WHERE statut = 'diffusee_vague2';

-- 3. Lecture pour le CDP affecté sur SA synthèse (vague 2 in-app).
-- SECURITY DEFINER pour ne pas dépendre des policies de clients.
CREATE OR REPLACE FUNCTION is_cdp_affecte_de(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM clients WHERE id = cid AND cdp_referent_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION is_cdp_affecte_de(UUID) TO authenticated;

CREATE POLICY document_synthese_select_cdp ON document_synthese
  FOR SELECT TO public
  USING (
    statut = 'cdp_affecte'
    AND client_id IS NOT NULL
    AND is_cdp_affecte_de(client_id)
  );

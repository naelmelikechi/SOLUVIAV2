-- Passation V2 — découplage de `prospects` (le chantier CRM Phase 2 supprimera
-- prospects/signature_requests : la synthèse doit survivre), saisies du
-- Développeur portées par le document, échéances 18h/48h idempotentes, lecture
-- RLS pour le CDP affecté. La section 8 (recommandation d'affectation) vit
-- dans une table dédiée `document_synthese_reco` : c'est la seule frontière
-- qui garantit qu'elle ne peut PAS être lue par le CDP affecté, même via un
-- appel PostgREST direct (audit RLS 2026-07-07).

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
  -- Section 6 (champ libre Développeur — visible du CDP affecté, contrairement
  -- à la section 8).
  ADD COLUMN IF NOT EXISTS points_vigilance TEXT,
  ADD COLUMN IF NOT EXISTS promesses_orales TEXT,
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

-- 2. Section 8 : table dédiée, JAMAIS lisible par le CDP affecté (RLS
-- pipeline/admin uniquement, aucune policy CDP).
CREATE TABLE document_synthese_reco (
  synthese_id           UUID PRIMARY KEY
                        REFERENCES document_synthese(id) ON DELETE CASCADE,
  typologie_client      typologie_client,
  charge_previsionnelle niveau_charge,
  risque_churn          niveau_risque,
  cdp_ideal             TEXT,
  cdp_a_eviter          TEXT,
  notes_inter_equipe    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_document_synthese_reco_updated
  BEFORE UPDATE ON document_synthese_reco
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE document_synthese_reco ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_synthese_reco_select ON document_synthese_reco
  FOR SELECT TO public USING (((SELECT is_admin()) OR has_pipeline_access()));
CREATE POLICY document_synthese_reco_insert ON document_synthese_reco
  FOR INSERT TO public WITH CHECK ((is_admin() OR has_pipeline_access()));
CREATE POLICY document_synthese_reco_update ON document_synthese_reco
  FOR UPDATE TO public USING ((is_admin() OR has_pipeline_access()));
CREATE POLICY document_synthese_reco_delete ON document_synthese_reco
  FOR DELETE TO public USING (is_admin());

-- 3. Backfill depuis les tables encore présentes.
UPDATE document_synthese ds
   SET client_id        = COALESCE(ds.client_id, p.client_id),
       points_vigilance = COALESCE(ds.points_vigilance, p.points_vigilance)
  FROM prospects p
 WHERE ds.prospect_id = p.id;

INSERT INTO document_synthese_reco (synthese_id, notes_inter_equipe)
SELECT ds.id, p.notes_inter_equipe
  FROM document_synthese ds
  JOIN prospects p ON p.id = ds.prospect_id
 WHERE p.notes_inter_equipe IS NOT NULL
ON CONFLICT (synthese_id) DO NOTHING;

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

-- Scrub des snapshots V1 : la row prospects sérialisée dans `contenu` embarque
-- les champs section 6/8 ; ils viennent d'être recopiés dans les colonnes /
-- la table dédiées, on les retire du JSONB avant d'ouvrir la lecture au CDP.
UPDATE document_synthese
   SET contenu = (contenu #- '{prospect,notes_inter_equipe}')
                          #- '{prospect,points_vigilance}'
 WHERE contenu ? 'prospect';

-- 4. Lecture pour le CDP affecté sur SA synthèse (vague 2 in-app).
-- SECURITY DEFINER : ne dépend pas des policies de clients (fail-closed si
-- clients_select se durcit un jour).
CREATE OR REPLACE FUNCTION is_cdp_affecte_de(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM clients WHERE id = cid AND cdp_referent_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION is_cdp_affecte_de(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION is_cdp_affecte_de(UUID) TO authenticated;

-- Policy SELECT unique (pas de multi-permissive) : pipeline/admin comme avant,
-- OU le CDP affecté une fois la vague 2 déclenchée.
DROP POLICY IF EXISTS document_synthese_select ON document_synthese;
CREATE POLICY document_synthese_select ON document_synthese
  FOR SELECT TO public
  USING (
    (SELECT is_admin())
    OR has_pipeline_access()
    OR (
      statut = 'cdp_affecte'
      AND client_id IS NOT NULL
      AND is_cdp_affecte_de(client_id)
    )
  );

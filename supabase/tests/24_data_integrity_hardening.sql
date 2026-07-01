-- ===========================================================================
-- Test : durcissement integrite donnees (20260630132000)
-- ===========================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

-- 1. prospects.siret : index unique PLEIN (plus partiel) -> inferable onConflict
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='idx_prospects_siret_unique'
      AND indexdef NOT LIKE '%WHERE%'
  ),
  'idx_prospects_siret_unique est un index unique PLEIN (pas partiel)'
);

-- 2. echeances.facture_id : FK ON DELETE SET NULL (confdeltype='n')
SELECT is(
  (SELECT confdeltype::text FROM pg_constraint WHERE conname='echeances_facture_id_fkey'),
  'n',
  'echeances_facture_id_fkey est ON DELETE SET NULL'
);

-- 3. ajustements : unique partiel (contrat_id,type) WHERE resolved_at IS NULL
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='uq_ajustements_pending_contrat_type_unresolved'),
  'uq_ajustements_pending_contrat_type_unresolved present'
);

-- 4-5. bornes TVA
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_factures_taux_tva_borne'),
  'chk_factures_taux_tva_borne present'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_fl_taux_tva_borne'),
  'chk_fl_taux_tva_borne present'
);

-- 6. paiements.montant <> 0
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_paiements_montant_non_nul'),
  'chk_paiements_montant_non_nul present'
);

SELECT * FROM finish();
ROLLBACK;

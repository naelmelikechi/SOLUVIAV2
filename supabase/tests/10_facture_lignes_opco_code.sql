-- Test : Colonne opco_code et persistence sur facture_lignes
-- - Colonne opco_code existe
-- - opco_code est nullable (pour factures libres)
-- - Index opco_code present (optimise les queries groupement/analytics)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(3);

-- Colonne existe
SELECT has_column(
  'facture_lignes', 'opco_code', 'facture_lignes.opco_code existe'
);

-- Nullable (factures libres ou lignes sans contrat)
SELECT col_is_null(
  'facture_lignes', 'opco_code', 'opco_code est nullable (factures libres)'
);

-- Index partial sur opco_code IS NOT NULL
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE tablename = 'facture_lignes' AND indexname = 'facture_lignes_opco_code_idx'),
  1,
  'index facture_lignes_opco_code_idx present'
);

SELECT * FROM finish();
ROLLBACK;

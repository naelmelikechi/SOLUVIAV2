-- Test : Referentiel OPCO et RLS
-- - Table opcos existe avec colonnes NOT NULL appropriees
-- - Index GIN sur prefixes_deca present
-- - Seed AKTO avec 6 prefixes configures

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

-- Schema : table opcos existe
SELECT has_table('opcos', 'table opcos existe');

-- Colonnes NOT NULL
SELECT col_not_null('opcos', 'code', 'opcos.code est NOT NULL');
SELECT col_not_null('opcos', 'prefixes_deca', 'opcos.prefixes_deca est NOT NULL');

-- Index GIN pour queries rapides sur prefixes
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE tablename = 'opcos' AND indexname = 'opcos_prefixes_deca_gin'),
  1,
  'index GIN opcos_prefixes_deca_gin present'
);

-- Seed : AKTO insere et actif
SELECT is(
  (SELECT count(*)::int FROM opcos WHERE code = 'AKTO' AND actif = true),
  1,
  'OPCO AKTO seed et actif'
);

-- AKTO a exactement 6 prefixes
SELECT is(
  (SELECT array_length(prefixes_deca, 1) FROM opcos WHERE code = 'AKTO'),
  6,
  'AKTO a 6 prefixes seed'
);

SELECT * FROM finish();
ROLLBACK;

-- Test : Referentiel OPCO et RLS
-- - Table opcos existe avec colonnes NOT NULL appropriees
-- - Index GIN sur idcc_codes present
-- - Seed AKTO avec IDCC mappes

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

-- Schema : table opcos existe
SELECT has_table('opcos', 'table opcos existe');

-- Colonnes NOT NULL
SELECT col_not_null('opcos', 'code', 'opcos.code est NOT NULL');
SELECT col_not_null('opcos', 'idcc_codes', 'opcos.idcc_codes est NOT NULL');

-- Index GIN pour queries rapides sur idcc_codes
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE tablename = 'opcos' AND indexname = 'opcos_idcc_codes_gin'),
  1,
  'index GIN opcos_idcc_codes_gin present'
);

-- Seed : AKTO insere et actif
SELECT is(
  (SELECT count(*)::int FROM opcos WHERE code = 'AKTO' AND actif = true),
  1,
  'OPCO AKTO seed et actif'
);

-- AKTO doit avoir des IDCC mappes (sinon l OPCO ne peut jamais etre resolu)
SELECT cmp_ok(
  (SELECT coalesce(array_length(idcc_codes, 1), 0) FROM opcos WHERE code = 'AKTO'),
  '>',
  0,
  'AKTO a des IDCC mappes'
);

SELECT * FROM finish();
ROLLBACK;

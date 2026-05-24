-- Test : lien factures.devis_id, flag est_acompte, index, FK.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(4);

-- 1. devis_id est nullable (is_nullable = 'YES')
SELECT is(
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'factures' AND column_name = 'devis_id'),
  'YES',
  'factures.devis_id est nullable'
);

-- 2. est_acompte est NOT NULL
SELECT col_not_null(
  'factures', 'est_acompte',
  'factures.est_acompte est NOT NULL'
);

-- 3. Index partiel idx_factures_devis present
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE tablename = 'factures' AND indexname = 'idx_factures_devis'),
  1,
  'index idx_factures_devis present'
);

-- 4. FK factures -> devis presente
SELECT is(
  (SELECT count(*)::int FROM information_schema.table_constraints
   WHERE table_name = 'factures'
   AND constraint_type = 'FOREIGN KEY'
   AND constraint_name LIKE '%devis%'),
  1,
  'FK factures -> devis presente'
);

SELECT * FROM finish();
ROLLBACK;

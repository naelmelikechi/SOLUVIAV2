BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(5);

SELECT col_not_null(
  'factures', 'societe_emettrice_id',
  'factures.societe_emettrice_id est NOT NULL'
);

SELECT is(
  (SELECT count(*)::int FROM information_schema.table_constraints
   WHERE table_name = 'factures'
   AND constraint_type = 'FOREIGN KEY'
   AND constraint_name LIKE '%societe_emettrice%'),
  1,
  'FK factures -> societes_emettrices presente'
);

SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE tablename = 'factures' AND indexname = 'idx_factures_societe_emettrice'),
  1,
  'index idx_factures_societe_emettrice present'
);

SELECT is(
  (SELECT count(*)::int FROM pg_proc WHERE proname = 'generate_facture_ref'),
  1,
  'fonction generate_facture_ref preservee (non-regression Phase 1)'
);

SELECT is(
  (SELECT count(*)::int FROM factures WHERE societe_emettrice_id IS NULL),
  0,
  'aucune facture sans societe_emettrice_id'
);

SELECT * FROM finish();
ROLLBACK;

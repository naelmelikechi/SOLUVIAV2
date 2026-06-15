-- Tests kpi_snapshots : index compose + unicite scoped.
-- Verifie :
--   1. L'index compose kpi_snapshots_scope_type_mois_idx existe.
--   2. Insert scope=projet avec scope_id valide accepte (service_role).
--   3. Un doublon (mois, type_kpi, scope, scope_id) est rejete par l'index
--      partiel uq_snapshot_scoped (depuis 20260525100000 : la contrainte
--      uq_snapshot d'origine ne couvrait pas scope_id NOT NULL correctement).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(3);

-- 1. L'index compose existe
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename  = 'kpi_snapshots'
     AND indexname  = 'kpi_snapshots_scope_type_mois_idx'),
  1,
  'Index compose kpi_snapshots_scope_type_mois_idx existe'
);

-- 2. Insert scope=projet avec scope_id valide accepte en service_role
SET LOCAL role TO service_role;

SELECT lives_ok(
  $$INSERT INTO kpi_snapshots (mois, type_kpi, valeur, scope, scope_id)
     VALUES ('2099-01-01', 'test_kpi_pgtap', 42, 'projet', '11111111-1111-1111-1111-111111111111')$$,
  'Insert scope=projet en service_role accepte'
);

-- 3. Doublon exact (meme mois, type_kpi, scope, scope_id) -> rejete (23505).
SELECT throws_ok(
  $$INSERT INTO kpi_snapshots (mois, type_kpi, valeur, scope, scope_id)
     VALUES ('2099-01-01', 'test_kpi_pgtap', 99, 'projet', '11111111-1111-1111-1111-111111111111')$$,
  '23505',
  NULL,
  'Doublon (mois,type_kpi,scope,scope_id) rejete par uq_snapshot_scoped'
);

SELECT * FROM finish();
ROLLBACK;

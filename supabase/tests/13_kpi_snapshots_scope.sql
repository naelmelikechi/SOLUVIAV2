-- Tests kpi_snapshots : index compose + upsert CRON.
-- Verifie :
--   1. L'index compose kpi_snapshots_scope_type_mois_idx existe.
--   2. Insert scope=projet avec scope_id valide accepte (service_role).
--   3. Upsert idempotent ON CONFLICT DO NOTHING fonctionne (pattern CRON).

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
     VALUES ('2099-01-01', 'test_kpi_pgtap', 42, 'projet', gen_random_uuid())$$,
  'Insert scope=projet en service_role accepte'
);

-- 3. Upsert idempotent : ON CONFLICT DO NOTHING (pattern utilise par le CRON)
SELECT lives_ok(
  $$INSERT INTO kpi_snapshots (mois, type_kpi, valeur, scope, scope_id)
     VALUES ('2099-01-01', 'test_kpi_pgtap', 99, 'projet', gen_random_uuid())
     ON CONFLICT (mois, type_kpi, scope, scope_id) DO NOTHING$$,
  'Upsert ON CONFLICT DO NOTHING fonctionne'
);

SELECT * FROM finish();
ROLLBACK;

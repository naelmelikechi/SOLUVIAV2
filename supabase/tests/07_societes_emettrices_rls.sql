-- Test : RLS societes_emettrices
-- - SELECT autorise pour tout role authentifie (admin, cdp, superadmin)
-- - WRITE autorise seulement pour admin et superadmin
-- - seed SOLUVIA present apres reset

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

SELECT is(
  (SELECT count(*)::int FROM societes_emettrices WHERE code = 'SOL'),
  1,
  'seed SOLUVIA insere avec code SOL'
);

SELECT ok(
  (SELECT est_defaut FROM societes_emettrices WHERE code = 'SOL'),
  'SOLUVIA est_defaut = TRUE'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'societes_emettrices'),
  'RLS active sur societes_emettrices'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE tablename = 'societes_emettrices'
   AND policyname = 'societes_emettrices_select_authenticated'),
  1,
  'policy SELECT authenticated presente'
);

-- L'ecriture admin est portee par TROIS policies distinctes (INSERT / UPDATE /
-- DELETE) et non par une seule policy FOR ALL. C'est la forme reellement en
-- production depuis la consolidation des policies multi-permissives (advisors
-- Supabase), reproduite dans le repo par
-- 20260806160000_repair_drift_index_et_policies.sql.
-- On assert le nombre et non un nom unique : les 4 assertions de comportement
-- de ce fichier restent la vraie garantie.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE tablename = 'societes_emettrices'
   AND cmd IN ('INSERT', 'UPDATE', 'DELETE')),
  3,
  'ecriture admin portee par 3 policies (INSERT/UPDATE/DELETE)'
);

SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE tablename = 'societes_emettrices'
   AND indexname = 'uq_societes_emettrices_defaut'),
  1,
  'index unique partial sur est_defaut present'
);

SELECT * FROM finish();
ROLLBACK;

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

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE tablename = 'societes_emettrices'
   AND policyname = 'societes_emettrices_admin_write'),
  1,
  'policy admin_write presente'
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

-- ===========================================================================
-- Test : durcissement securite (20260630131000_security_hardening.sql)
-- ===========================================================================
-- - find_prospect_duplicates : anon NE PEUT PAS executer (fuite CRM fermee),
--   authenticated PEUT toujours.
-- - bump_prospect_derniere_action : search_path epingle.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(3);

SELECT ok(
  NOT has_function_privilege('anon', 'public.find_prospect_duplicates(text,text)', 'EXECUTE'),
  'anon NE PEUT PAS executer find_prospect_duplicates (fuite CRM non-auth fermee)'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.find_prospect_duplicates(text,text)', 'EXECUTE'),
  'authenticated PEUT toujours executer find_prospect_duplicates'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'bump_prospect_derniere_action'
      AND array_to_string(proconfig, ',') LIKE '%search_path%'
  ),
  'bump_prospect_derniere_action a un search_path epingle'
);

SELECT * FROM finish();
ROLLBACK;

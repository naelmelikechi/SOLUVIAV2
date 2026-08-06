-- ===========================================================================
-- Test : les helpers de permission RLS verifient `users.actif`
-- ===========================================================================
-- Migration : 20260806140000_role_helpers_verifient_actif.sql
-- Contexte  : audit #122, constat 3.
--
-- Spec :
--   - un admin ACTIF : is_admin() vrai, et il lit une table admin-only
--   - le MEME admin desactive : is_admin() faux, et il ne lit plus rien
--   - idem pour les 3 autres helpers de permission
--   - get_user_role() n'est PAS touchee (accesseur, pas garde de permission)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(7);

CREATE TEMP TABLE _ctx (admin_id UUID);
INSERT INTO _ctx (admin_id) VALUES (gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-actif@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role, actif)
SELECT admin_id, 'admin-actif@test.local', 'Admin', 'Actif',
       'admin'::role_utilisateur, true
FROM _ctx;

-- Helpers : evalue une fonction booleenne sous l'identite d'un utilisateur.
CREATE OR REPLACE FUNCTION pg_temp.helper_as(p_user_id UUID, p_fn TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_res BOOLEAN;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  EXECUTE format('SELECT public.%I()', p_fn) INTO v_res;
  RESET role;
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.role_as(p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_res TEXT;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  SELECT public.get_user_role() INTO v_res;
  RESET role;
  RETURN v_res;
END;
$$;

-- ----- Compte ACTIF : tout fonctionne comme avant --------------------------

SELECT is(
  (SELECT pg_temp.helper_as(admin_id, 'is_admin') FROM _ctx),
  true,
  'Un admin actif est bien is_admin()'
);

SELECT is(
  (SELECT pg_temp.helper_as(admin_id, 'has_pipeline_access') FROM _ctx),
  true,
  'Un admin actif a bien has_pipeline_access()'
);

-- ----- Le MEME compte, desactive -------------------------------------------

UPDATE public.users SET actif = false
WHERE id = (SELECT admin_id FROM _ctx);

SELECT is(
  (SELECT pg_temp.helper_as(admin_id, 'is_admin') FROM _ctx),
  false,
  'Un admin DESACTIVE n est plus is_admin() (coeur du constat 3)'
);

SELECT is(
  (SELECT pg_temp.helper_as(admin_id, 'has_pipeline_access') FROM _ctx),
  false,
  'Un admin desactive perd has_pipeline_access()'
);

SELECT is(
  (SELECT pg_temp.helper_as(admin_id, 'has_ship_ideas_access') FROM _ctx),
  false,
  'Un admin desactive perd has_ship_ideas_access()'
);

SELECT is(
  (SELECT pg_temp.helper_as(admin_id, 'has_validate_ideas_access') FROM _ctx),
  false,
  'Un admin desactive perd has_validate_ideas_access()'
);

-- ----- get_user_role() reste inchangee -------------------------------------
-- Volontairement : c'est un accesseur, et des policies comparent une valeur a
-- son resultat (dont users_update). Lui faire renvoyer NULL casserait ces
-- comparaisons pour un motif etranger au sujet.

SELECT is(
  (SELECT pg_temp.role_as(admin_id) FROM _ctx),
  'admin',
  'get_user_role() renvoie toujours le role, meme compte desactive (accesseur)'
);

SELECT * FROM finish();
ROLLBACK;

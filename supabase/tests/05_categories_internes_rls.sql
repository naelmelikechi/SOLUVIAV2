-- ===========================================================================
-- Test : RLS categories_internes (admin write, all read)
-- ===========================================================================
-- Migration : 20260512141303_categories_internes_table.sql
--
-- Spec :
--   - SELECT : authenticated (admin + cdp) peut lire
--   - INSERT/UPDATE/DELETE : admin/superadmin uniquement
--   - CDP refuse en ecriture

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

-- Setup : 1 admin + 1 cdp
CREATE TEMP TABLE _ctx (
  admin_id UUID,
  cdp_id UUID,
  cat_id UUID
);
INSERT INTO _ctx (admin_id, cdp_id) VALUES (gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-ci@test.local' FROM _ctx
UNION ALL
SELECT cdp_id, 'cdp-ci@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role)
SELECT admin_id, 'admin-ci@test.local', 'Admin', 'CI', 'admin'::role_utilisateur FROM _ctx
UNION ALL
SELECT cdp_id, 'cdp-ci@test.local', 'Cdp', 'CI', 'cdp'::role_utilisateur FROM _ctx;

-- Helpers pour switcher de role et tenter INSERT / SELECT / UPDATE
CREATE OR REPLACE FUNCTION pg_temp.try_insert_as(p_user_id UUID, p_code TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  BEGIN
    INSERT INTO public.categories_internes (code, libelle, ordre)
    VALUES (p_code, 'Test ' || p_code, 99);
    v_count := 1;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    v_count := 0;
  END;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.try_select_count_as(p_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_count FROM public.categories_internes;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.try_update_libelle_as(p_user_id UUID, p_cat_id UUID, p_new TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  WITH u AS (
    UPDATE public.categories_internes SET libelle = p_new
    WHERE id = p_cat_id RETURNING id
  )
  SELECT count(*) INTO v_count FROM u;
  RESET role;
  RETURN v_count;
END;
$$;

-- ----- Tests --------------------------------------------------------------

-- Test 1 : admin peut INSERT
SELECT is(
  pg_temp.try_insert_as((SELECT admin_id FROM _ctx), 'test_admin_insert'),
  1,
  'Admin peut INSERT dans categories_internes'
);

UPDATE _ctx SET cat_id = (
  SELECT id FROM public.categories_internes WHERE code = 'test_admin_insert'
);

-- Test 2 : cdp ne peut PAS INSERT
SELECT is(
  pg_temp.try_insert_as((SELECT cdp_id FROM _ctx), 'test_cdp_insert'),
  0,
  'CDP ne peut pas INSERT dans categories_internes'
);

-- Test 3 : la ligne CDP n existe pas (n a pas ete inseree)
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.categories_internes WHERE code = 'test_cdp_insert'),
  'INSERT CDP n a pas ete persiste'
);

-- Test 4 : admin peut UPDATE
SELECT is(
  pg_temp.try_update_libelle_as(
    (SELECT admin_id FROM _ctx),
    (SELECT cat_id FROM _ctx),
    'Modifie par admin'
  ),
  1,
  'Admin peut UPDATE categories_internes'
);

-- Test 5 : cdp ne peut PAS UPDATE
SELECT is(
  pg_temp.try_update_libelle_as(
    (SELECT cdp_id FROM _ctx),
    (SELECT cat_id FROM _ctx),
    'Modifie par cdp'
  ),
  0,
  'CDP ne peut pas UPDATE categories_internes'
);

-- Test 6 : cdp peut SELECT (lecture libre)
SELECT cmp_ok(
  pg_temp.try_select_count_as((SELECT cdp_id FROM _ctx)),
  '>=',
  6,
  'CDP peut SELECT les categories internes (6 seedees minimum)'
);

SELECT * FROM finish();
ROLLBACK;

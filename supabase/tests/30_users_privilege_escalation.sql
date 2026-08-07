-- ===========================================================================
-- Test : escalade de privileges sur public.users + lecture anonyme
-- ===========================================================================
-- Migration : 20260806100000_fix_rls_escalade_privileges_et_lecture_anon.sql
-- Contexte  : audit du 2026-08-06 (issue #122), faille confirmee en production.
--
-- Spec :
--   - un non-admin NE PEUT PAS modifier son propre `role` (escalade superadmin)
--   - un non-admin NE PEUT PAS modifier son propre `actif`
--   - un non-admin PEUT toujours modifier ses champs anodins (prenom)
--   - un admin PEUT toujours modifier le role d'un autre utilisateur
--   - le role `anon` ne lit PLUS public.users
--   - un utilisateur connecte lit toujours public.users
--   - aucune des 13 tables visees n'a plus de policy SELECT ouverte a anon
--
-- Complete le 2026-08-07 (issue #143, constat 1) : la version initiale ne
-- couvrait que `role` et `actif`. Les quatre flags de droits voisins etaient
-- restes librement auto-attribuables par un PATCH PostgREST direct.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(12);

-- Setup : 1 admin + 1 cdp
CREATE TEMP TABLE _ctx (admin_id UUID, cdp_id UUID);
INSERT INTO _ctx (admin_id, cdp_id) VALUES (gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-esc@test.local' FROM _ctx
UNION ALL
SELECT cdp_id, 'cdp-esc@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role)
SELECT admin_id, 'admin-esc@test.local', 'Admin', 'Esc', 'admin'::role_utilisateur FROM _ctx
UNION ALL
SELECT cdp_id, 'cdp-esc@test.local', 'Cdp', 'Esc', 'cdp'::role_utilisateur FROM _ctx;

-- Helpers ------------------------------------------------------------------

-- Tente de changer son propre role. Renvoie le role effectif APRES tentative.
CREATE OR REPLACE FUNCTION pg_temp.try_self_promote(p_user_id UUID, p_role TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_role TEXT;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  BEGIN
    EXECUTE format(
      'UPDATE public.users SET role = %L::role_utilisateur WHERE id = %L',
      p_role, p_user_id
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    NULL; -- l'echec est le comportement attendu
  END;
  RESET role;
  SELECT role::text INTO v_role FROM public.users WHERE id = p_user_id;
  RETURN v_role;
END;
$$;

-- Tente de changer son propre statut actif. Renvoie `actif` APRES tentative.
CREATE OR REPLACE FUNCTION pg_temp.try_self_deactivate(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_actif BOOLEAN;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  BEGIN
    UPDATE public.users SET actif = false WHERE id = p_user_id;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    NULL;
  END;
  RESET role;
  SELECT actif INTO v_actif FROM public.users WHERE id = p_user_id;
  RETURN v_actif;
END;
$$;

-- Modifie un champ anodin sur sa propre ligne. Renvoie le prenom apres coup.
CREATE OR REPLACE FUNCTION pg_temp.try_self_rename(p_user_id UUID, p_prenom TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_prenom TEXT;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  BEGIN
    UPDATE public.users SET prenom = p_prenom WHERE id = p_user_id;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    NULL;
  END;
  RESET role;
  SELECT prenom INTO v_prenom FROM public.users WHERE id = p_user_id;
  RETURN v_prenom;
END;
$$;

-- Un admin change le role d'un autre utilisateur. Renvoie le role apres coup.
CREATE OR REPLACE FUNCTION pg_temp.try_admin_set_role(
  p_admin_id UUID, p_target_id UUID, p_role TEXT
)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_role TEXT;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_admin_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  BEGIN
    EXECUTE format(
      'UPDATE public.users SET role = %L::role_utilisateur WHERE id = %L',
      p_role, p_target_id
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    NULL;
  END;
  RESET role;
  SELECT role::text INTO v_role FROM public.users WHERE id = p_target_id;
  RETURN v_role;
END;
$$;

-- Compte les lignes de public.users vues par anon (aucun JWT).
CREATE OR REPLACE FUNCTION pg_temp.count_users_as_anon()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- JWT sans `sub` : auth.uid() renvoie NULL, on est bien en contexte anonyme.
  -- (Mettre la variable a NULL ou '' ferait echouer le cast ::json d'auth.uid().)
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );
  SET LOCAL role anon;
  SELECT count(*) INTO v_count FROM public.users;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.count_users_as(p_user_id UUID)
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
  SELECT count(*) INTO v_count FROM public.users;
  RESET role;
  RETURN v_count;
END;
$$;


-- Tente de s'auto-attribuer un flag de droits. Renvoie sa valeur APRES coup.
CREATE OR REPLACE FUNCTION pg_temp.try_self_grant(p_user_id UUID, p_col TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_val BOOLEAN;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  BEGIN
    EXECUTE format('UPDATE public.users SET %I = true WHERE id = %L', p_col, p_user_id);
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    NULL; -- l'echec est le comportement attendu
  END;
  RESET role;
  EXECUTE format('SELECT %I FROM public.users WHERE id = %L', p_col, p_user_id)
    INTO v_val;
  RETURN v_val;
END;
$$;

-- Un admin attribue un flag de droits a un autre utilisateur (anti-regression).
CREATE OR REPLACE FUNCTION pg_temp.try_admin_grant(
  p_admin_id UUID, p_target_id UUID, p_col TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_val BOOLEAN;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_admin_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  BEGIN
    EXECUTE format('UPDATE public.users SET %I = true WHERE id = %L', p_col, p_target_id);
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    NULL;
  END;
  RESET role;
  EXECUTE format('SELECT %I FROM public.users WHERE id = %L', p_col, p_target_id)
    INTO v_val;
  RETURN v_val;
END;
$$;

-- ----- Tests --------------------------------------------------------------

-- Test 1 : le coeur de la faille. Un cdp ne devient pas superadmin.
SELECT is(
  (SELECT pg_temp.try_self_promote(cdp_id, 'superadmin') FROM _ctx),
  'cdp',
  'Un cdp ne peut pas se promouvoir superadmin'
);

-- Test 2 : ni admin, pour ecarter le cas d un simple filtre sur "superadmin".
SELECT is(
  (SELECT pg_temp.try_self_promote(cdp_id, 'admin') FROM _ctx),
  'cdp',
  'Un cdp ne peut pas se promouvoir admin'
);

-- Test 3 : il ne peut pas non plus toucher a son statut actif.
SELECT is(
  (SELECT pg_temp.try_self_deactivate(cdp_id) FROM _ctx),
  true,
  'Un cdp ne peut pas modifier son statut actif'
);

-- Test 4 : anti-regression. La self-edition legitime fonctionne toujours.
SELECT is(
  (SELECT pg_temp.try_self_rename(cdp_id, 'Renomme') FROM _ctx),
  'Renomme',
  'Un cdp peut toujours modifier son prenom'
);

-- Test 5 : anti-regression. L administration des roles reste possible.
SELECT is(
  (SELECT pg_temp.try_admin_set_role(admin_id, cdp_id, 'commercial') FROM _ctx),
  'commercial',
  'Un admin peut toujours changer le role d un autre utilisateur'
);

-- Test 6 : anon ne lit plus la table des utilisateurs.
SELECT is(
  pg_temp.count_users_as_anon(),
  0,
  'Le role anon ne lit aucune ligne de public.users'
);

-- Test 7 : aucune des 13 tables visees n est encore ouverte a anon en lecture.
SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'SELECT'
      AND (roles::text = '{public}' OR roles::text LIKE '%anon%')
      AND (qual = 'true' OR qual IS NULL)
      AND tablename IN (
        'apprenants', 'axes_temps', 'client_contacts', 'client_documents',
        'client_notes', 'clients', 'echeanciers_templates', 'eduvia_companies',
        'formations', 'idees', 'jours_feries', 'typologies_projet', 'users'
      )
  ),
  0,
  'Aucune policy SELECT permissive ouverte a anon sur les 13 tables sensibles'
);

-- Tests 8 a 11 : les quatre flags de droits. C'est le coeur du constat 1 du
-- 2026-08-07. Chacun est teste separement : le trigger doit tous les couvrir,
-- pas seulement le premier de la condition.

-- pipeline_access commande les 9 policies `for all` du schema crm, plus
-- document_synthese, signature_requests, document_templates,
-- cdp_affectation_history, kpi_snapshots et trois buckets Storage.
SELECT is(
  (SELECT pg_temp.try_self_grant(cdp_id, 'pipeline_access') FROM _ctx),
  false,
  'Un non-admin ne peut pas s auto-attribuer pipeline_access'
);

-- referent_cdp est le seul controle avant applyAffectation(), qui ecrit en
-- service_role : se l attribuer permet de se reaffecter n importe quel client.
SELECT is(
  (SELECT pg_temp.try_self_grant(cdp_id, 'referent_cdp') FROM _ctx),
  false,
  'Un non-admin ne peut pas s auto-attribuer referent_cdp'
);

SELECT is(
  (SELECT pg_temp.try_self_grant(cdp_id, 'can_ship_ideas') FROM _ctx),
  false,
  'Un non-admin ne peut pas s auto-attribuer can_ship_ideas'
);

SELECT is(
  (SELECT pg_temp.try_self_grant(cdp_id, 'can_validate_ideas') FROM _ctx),
  false,
  'Un non-admin ne peut pas s auto-attribuer can_validate_ideas'
);

-- Test 12 : anti-regression. L attribution legitime par un admin reste possible
-- (sinon le correctif casserait l administration des droits).
SELECT is(
  (SELECT pg_temp.try_admin_grant(admin_id, cdp_id, 'pipeline_access') FROM _ctx),
  true,
  'Un admin peut toujours attribuer pipeline_access a un autre utilisateur'
);

SELECT * FROM finish();
ROLLBACK;

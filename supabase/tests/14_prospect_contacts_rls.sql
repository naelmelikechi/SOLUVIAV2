-- ===========================================================================
-- Test : RLS sur prospect_contacts (module commercial — fiche prospect V2)
-- ===========================================================================
-- Migration : 20260615160200_prospect_fiche.sql
--
-- Spec (mêmes policies que prospects/lot3) :
--   SELECT : is_admin() OU has_pipeline_access()
--   INSERT : is_admin() OU has_pipeline_access()
--   UPDATE : is_admin() OU has_pipeline_access()
--   has_pipeline_access() = role admin/superadmin OU flag pipeline_access=true.
--
-- On vérifie qu'un user avec pipeline_access (ou admin) peut lire/insérer/
-- modifier un interlocuteur, et qu'un user SANS accès ne voit rien.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(7);

-- ----- Setup (exécuté en superuser -> bypass RLS) --------------------------
CREATE TEMP TABLE _ctx (
  admin_id   UUID,
  pipe_id    UUID,   -- cdp avec pipeline_access = true
  noacc_id   UUID,   -- cdp sans accès pipeline
  prospect_id UUID,
  contact_id UUID
);

INSERT INTO _ctx (admin_id, pipe_id, noacc_id, prospect_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-pc@test.local' FROM _ctx
UNION ALL SELECT pipe_id,  'pipe-pc@test.local'  FROM _ctx
UNION ALL SELECT noacc_id, 'noacc-pc@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role, pipeline_access)
SELECT admin_id, 'admin-pc@test.local', 'Admin', 'PC', 'admin'::role_utilisateur, false FROM _ctx
UNION ALL
SELECT pipe_id,  'pipe-pc@test.local',  'Pipe',  'PC', 'cdp'::role_utilisateur,   true  FROM _ctx
UNION ALL
SELECT noacc_id, 'noacc-pc@test.local', 'Noacc', 'PC', 'cdp'::role_utilisateur,   false FROM _ctx;

-- 1 prospect + 1 interlocuteur de référence (insérés en superuser).
INSERT INTO prospects (id, type_prospect, nom)
SELECT prospect_id, 'entreprise'::type_prospect, 'Prospect RLS PC' FROM _ctx;

DO $$
DECLARE
  v_contact UUID;
BEGIN
  INSERT INTO prospect_contacts (prospect_id, nom)
    VALUES ((SELECT prospect_id FROM _ctx), 'Contact initial')
    RETURNING id INTO v_contact;
  UPDATE _ctx SET contact_id = v_contact;
END $$;

-- ----- Helpers : exécutent une requête sous l'identité d'un user (RLS ON) --
CREATE OR REPLACE FUNCTION pg_temp.select_count_as(
  p_user_id UUID,
  p_contact_id UUID
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  SELECT count(*)::int INTO v_count
    FROM public.prospect_contacts WHERE id = p_contact_id;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_as(
  p_user_id UUID,
  p_prospect_id UUID,
  p_nom TEXT
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  -- Sous-bloc : une violation RLS (WITH CHECK) lève 42501, on la convertit en
  -- -1 pour comparer proprement sans laisser le role à authenticated.
  BEGIN
    INSERT INTO public.prospect_contacts (prospect_id, nom)
      VALUES (p_prospect_id, p_nom);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := -1;
  END;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.update_as(
  p_user_id UUID,
  p_contact_id UUID,
  p_nom TEXT
) RETURNS INTEGER LANGUAGE plpgsql AS $$
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
    UPDATE public.prospect_contacts SET nom = p_nom
      WHERE id = p_contact_id RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM u;
  RESET role;
  RETURN v_count;
END;
$$;

-- ----- Tests ---------------------------------------------------------------

-- 1. RLS bien active sur la table.
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'prospect_contacts'),
  'RLS active sur prospect_contacts'
);

-- 2. Admin voit l'interlocuteur.
SELECT is(
  pg_temp.select_count_as((SELECT admin_id FROM _ctx), (SELECT contact_id FROM _ctx)),
  1,
  'Admin peut SELECT un interlocuteur'
);

-- 3. User pipeline (flag pipeline_access=true) voit l'interlocuteur.
SELECT is(
  pg_temp.select_count_as((SELECT pipe_id FROM _ctx), (SELECT contact_id FROM _ctx)),
  1,
  'User avec pipeline_access peut SELECT un interlocuteur'
);

-- 4. User sans accès ne voit RIEN.
SELECT is(
  pg_temp.select_count_as((SELECT noacc_id FROM _ctx), (SELECT contact_id FROM _ctx)),
  0,
  'User sans pipeline_access ne peut PAS SELECT un interlocuteur'
);

-- 5. User pipeline peut INSERT.
SELECT is(
  pg_temp.insert_as((SELECT pipe_id FROM _ctx), (SELECT prospect_id FROM _ctx), 'Ajouté pipeline'),
  1,
  'User avec pipeline_access peut INSERT un interlocuteur'
);

-- 6. User sans accès ne peut PAS INSERT (RLS WITH CHECK -> bloqué).
SELECT is(
  pg_temp.insert_as((SELECT noacc_id FROM _ctx), (SELECT prospect_id FROM _ctx), 'Tentative noacc'),
  -1,
  'User sans pipeline_access ne peut PAS INSERT (WITH CHECK refuse)'
);

-- 7. User pipeline peut UPDATE l'interlocuteur de référence.
SELECT is(
  pg_temp.update_as((SELECT pipe_id FROM _ctx), (SELECT contact_id FROM _ctx), 'Contact renommé'),
  1,
  'User avec pipeline_access peut UPDATE un interlocuteur'
);

SELECT * FROM finish();
ROLLBACK;

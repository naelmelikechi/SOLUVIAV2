-- ===========================================================================
-- Test : RLS sur document_templates (Feature 4 — bibliothèque de modèles)
-- ===========================================================================
-- Migration : 20260615160700_document_templates.sql
--
-- Spec :
--   SELECT : is_admin() OU has_pipeline_access()
--   INSERT/UPDATE/DELETE : is_admin() SEUL (la Direction publie les modèles)
--
-- Invariant clé vs prospect_contacts : l'écriture est réservée aux admins.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

-- ----- Setup (superuser -> bypass RLS) -------------------------------------
CREATE TEMP TABLE _ctx (admin_id UUID, pipe_id UUID, noacc_id UUID);
INSERT INTO _ctx (admin_id, pipe_id, noacc_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-dt@test.local' FROM _ctx
UNION ALL SELECT pipe_id,  'pipe-dt@test.local'  FROM _ctx
UNION ALL SELECT noacc_id, 'noacc-dt@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role, pipeline_access)
SELECT admin_id, 'admin-dt@test.local', 'Admin', 'DT', 'admin'::role_utilisateur, false FROM _ctx
UNION ALL
SELECT pipe_id,  'pipe-dt@test.local',  'Pipe',  'DT', 'cdp'::role_utilisateur, true  FROM _ctx
UNION ALL
SELECT noacc_id, 'noacc-dt@test.local', 'Noacc', 'DT', 'cdp'::role_utilisateur, false FROM _ctx;

-- Le seed de la migration crée déjà 5 modèles ; on teste SELECT sur l'un d'eux.

CREATE OR REPLACE FUNCTION pg_temp.select_count_as(p_user_id UUID, p_code TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  SELECT count(*)::int INTO v_count FROM public.document_templates WHERE code = p_code;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_as(p_user_id UUID, p_code TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  BEGIN
    INSERT INTO public.document_templates (code, nom) VALUES (p_code, 'Test modèle');
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := -1;
  END;
  RESET role;
  RETURN v_count;
END;
$$;

-- ----- Tests ---------------------------------------------------------------

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'document_templates'),
  'RLS active sur document_templates'
);

SELECT is(
  pg_temp.select_count_as((SELECT admin_id FROM _ctx), 'presentation_pptx'),
  1,
  'Admin peut SELECT un modèle'
);

SELECT is(
  pg_temp.select_count_as((SELECT pipe_id FROM _ctx), 'presentation_pptx'),
  1,
  'User avec pipeline_access peut SELECT un modèle'
);

SELECT is(
  pg_temp.select_count_as((SELECT noacc_id FROM _ctx), 'presentation_pptx'),
  0,
  'User sans pipeline_access ne peut PAS SELECT un modèle'
);

SELECT is(
  pg_temp.insert_as((SELECT admin_id FROM _ctx), 'test_modele_admin'),
  1,
  'Admin peut INSERT un modèle'
);

SELECT is(
  pg_temp.insert_as((SELECT pipe_id FROM _ctx), 'test_modele_pipe'),
  -1,
  'User pipeline NON-admin ne peut PAS INSERT un modèle (écriture = Direction)'
);

SELECT * FROM finish();
ROLLBACK;

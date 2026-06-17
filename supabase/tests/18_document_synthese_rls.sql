-- ===========================================================================
-- Test : RLS sur document_synthese (Feature 6 — synthèse de passation)
-- ===========================================================================
-- Migration : 20260615161000_document_synthese.sql
--
-- Spec :
--   SELECT : is_admin() OU has_pipeline_access()
--   INSERT : is_admin() OU has_pipeline_access()
--   UPDATE : is_admin() OU has_pipeline_access()
--   DELETE : is_admin()
--
-- Invariant clé : la synthèse de passation reste interne au pipeline ; un user
-- sans accès pipeline ne la voit pas et ne peut pas la créer.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

-- ----- Setup (superuser -> bypass RLS) -------------------------------------
CREATE TEMP TABLE _ctx (
  admin_id UUID, pipe_id UUID, noacc_id UUID, prospect_id UUID, synth_id UUID
);
INSERT INTO _ctx (admin_id, pipe_id, noacc_id, prospect_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-syn@test.local' FROM _ctx
UNION ALL SELECT pipe_id,  'pipe-syn@test.local'  FROM _ctx
UNION ALL SELECT noacc_id, 'noacc-syn@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role, pipeline_access)
SELECT admin_id, 'admin-syn@test.local', 'Admin', 'Syn', 'admin'::role_utilisateur, false FROM _ctx
UNION ALL
SELECT pipe_id,  'pipe-syn@test.local',  'Pipe',  'Syn', 'cdp'::role_utilisateur, true  FROM _ctx
UNION ALL
SELECT noacc_id, 'noacc-syn@test.local', 'Noacc', 'Syn', 'cdp'::role_utilisateur, false FROM _ctx;

-- Prospect de référence (FK prospect_id) + une synthèse à lire.
INSERT INTO prospects (id, type_prospect, nom)
SELECT prospect_id, 'entreprise'::type_prospect, 'Prospect RLS Synthese' FROM _ctx;

DO $$
DECLARE v_synth UUID;
BEGIN
  INSERT INTO document_synthese (prospect_id)
    VALUES ((SELECT prospect_id FROM _ctx))
    RETURNING id INTO v_synth;
  UPDATE _ctx SET synth_id = v_synth;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.select_count_as(p_user_id UUID, p_synth_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  SELECT count(*)::int INTO v_count
    FROM public.document_synthese WHERE id = p_synth_id;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_as(p_user_id UUID, p_prospect_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  BEGIN
    INSERT INTO public.document_synthese (prospect_id) VALUES (p_prospect_id);
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
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'document_synthese'),
  'RLS active sur document_synthese'
);

SELECT is(
  pg_temp.select_count_as((SELECT admin_id FROM _ctx), (SELECT synth_id FROM _ctx)),
  1, 'Admin peut SELECT une synthèse'
);

SELECT is(
  pg_temp.select_count_as((SELECT pipe_id FROM _ctx), (SELECT synth_id FROM _ctx)),
  1, 'User avec pipeline_access peut SELECT une synthèse'
);

SELECT is(
  pg_temp.select_count_as((SELECT noacc_id FROM _ctx), (SELECT synth_id FROM _ctx)),
  0, 'User sans pipeline_access ne voit PAS la synthèse'
);

SELECT is(
  pg_temp.insert_as((SELECT pipe_id FROM _ctx), (SELECT prospect_id FROM _ctx)),
  1, 'User avec pipeline_access peut INSERT une synthèse'
);

SELECT is(
  pg_temp.insert_as((SELECT noacc_id FROM _ctx), (SELECT prospect_id FROM _ctx)),
  -1, 'User sans pipeline_access ne peut PAS INSERT (WITH CHECK refuse)'
);

SELECT * FROM finish();
ROLLBACK;

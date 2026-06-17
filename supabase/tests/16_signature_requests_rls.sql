-- ===========================================================================
-- Test : RLS sur signature_requests (Feature 5 — signature de contrat)
-- ===========================================================================
-- Migration : 20260615160800_signature_requests.sql
--   SELECT/INSERT/UPDATE : is_admin() OU has_pipeline_access()
--   DELETE : is_admin()

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(5);

CREATE TEMP TABLE _ctx (
  admin_id UUID, pipe_id UUID, noacc_id UUID, prospect_id UUID, req_id UUID
);
INSERT INTO _ctx (admin_id, pipe_id, noacc_id, prospect_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-sig@test.local' FROM _ctx
UNION ALL SELECT pipe_id,  'pipe-sig@test.local'  FROM _ctx
UNION ALL SELECT noacc_id, 'noacc-sig@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role, pipeline_access)
SELECT admin_id, 'admin-sig@test.local', 'Admin', 'Sig', 'admin'::role_utilisateur, false FROM _ctx
UNION ALL
SELECT pipe_id,  'pipe-sig@test.local',  'Pipe',  'Sig', 'cdp'::role_utilisateur, true  FROM _ctx
UNION ALL
SELECT noacc_id, 'noacc-sig@test.local', 'Noacc', 'Sig', 'cdp'::role_utilisateur, false FROM _ctx;

INSERT INTO prospects (id, type_prospect, nom)
SELECT prospect_id, 'entreprise'::type_prospect, 'Prospect RLS Sig' FROM _ctx;

DO $$
DECLARE v_req UUID;
BEGIN
  INSERT INTO signature_requests (prospect_id, titre)
    VALUES ((SELECT prospect_id FROM _ctx), 'Contrat initial')
    RETURNING id INTO v_req;
  UPDATE _ctx SET req_id = v_req;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.select_count_as(p_user_id UUID, p_req_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  SELECT count(*)::int INTO v_count FROM public.signature_requests WHERE id = p_req_id;
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
    INSERT INTO public.signature_requests (prospect_id, titre)
      VALUES (p_prospect_id, 'Tentative');
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := -1;
  END;
  RESET role;
  RETURN v_count;
END;
$$;

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'signature_requests'),
  'RLS active sur signature_requests'
);

SELECT is(
  pg_temp.select_count_as((SELECT admin_id FROM _ctx), (SELECT req_id FROM _ctx)),
  1, 'Admin peut SELECT une demande de signature'
);

SELECT is(
  pg_temp.select_count_as((SELECT pipe_id FROM _ctx), (SELECT req_id FROM _ctx)),
  1, 'User avec pipeline_access peut SELECT une demande'
);

SELECT is(
  pg_temp.select_count_as((SELECT noacc_id FROM _ctx), (SELECT req_id FROM _ctx)),
  0, 'User sans pipeline_access ne voit PAS la demande'
);

SELECT is(
  pg_temp.insert_as((SELECT noacc_id FROM _ctx), (SELECT prospect_id FROM _ctx)),
  -1, 'User sans pipeline_access ne peut PAS INSERT (WITH CHECK refuse)'
);

SELECT * FROM finish();
ROLLBACK;

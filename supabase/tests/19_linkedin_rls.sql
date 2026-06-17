-- ===========================================================================
-- Test : RLS sur linkedin_events + linkedin_mapping_rules (Feature 9 —
--        connecteur LinkedIn → pipeline)
-- ===========================================================================
-- Migration : 20260615161100_linkedin_connecteur.sql
--
-- Spec (calque 15/16) :
--   SELECT : is_admin() OU has_pipeline_access()
--   INSERT/UPDATE/DELETE : is_admin() SEUL (le webhook écrit en service-role)
--
-- Invariant clé : un user pipeline NON-admin lit les évènements et les règles
-- mais ne peut RIEN écrire (l'ingestion passe par le service-role).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(11);

-- ----- Setup (superuser -> bypass RLS) -------------------------------------
CREATE TEMP TABLE _ctx (
  admin_id UUID, pipe_id UUID, noacc_id UUID, event_id UUID, rule_id UUID
);
INSERT INTO _ctx (admin_id, pipe_id, noacc_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-li@test.local' FROM _ctx
UNION ALL SELECT pipe_id,  'pipe-li@test.local'  FROM _ctx
UNION ALL SELECT noacc_id, 'noacc-li@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role, pipeline_access)
SELECT admin_id, 'admin-li@test.local', 'Admin', 'Li', 'admin'::role_utilisateur, false FROM _ctx
UNION ALL
SELECT pipe_id,  'pipe-li@test.local',  'Pipe',  'Li', 'commercial'::role_utilisateur, true  FROM _ctx
UNION ALL
SELECT noacc_id, 'noacc-li@test.local', 'Noacc', 'Li', 'commercial'::role_utilisateur, false FROM _ctx;

DO $$
DECLARE v_event UUID; v_rule UUID;
BEGIN
  INSERT INTO linkedin_events (type_evenement)
    VALUES ('reponse_positive'::type_evenement_linkedin)
    RETURNING id INTO v_event;
  INSERT INTO linkedin_mapping_rules (linkedin_company_pattern)
    VALUES ('acme')
    RETURNING id INTO v_rule;
  UPDATE _ctx SET event_id = v_event, rule_id = v_rule;
END $$;

-- ----- Helpers : exécutent une requête sous l'identité d'un user ------------
CREATE OR REPLACE FUNCTION pg_temp.select_count_event_as(p_user_id UUID, p_event_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  SELECT count(*)::int INTO v_count FROM public.linkedin_events WHERE id = p_event_id;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_event_as(p_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  BEGIN
    INSERT INTO public.linkedin_events (type_evenement)
      VALUES ('mention_interet'::type_evenement_linkedin);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := -1;
  END;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.select_count_rule_as(p_user_id UUID, p_rule_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  SELECT count(*)::int INTO v_count FROM public.linkedin_mapping_rules WHERE id = p_rule_id;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_rule_as(p_user_id UUID, p_pattern TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  BEGIN
    INSERT INTO public.linkedin_mapping_rules (linkedin_company_pattern)
      VALUES (p_pattern);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := -1;
  END;
  RESET role;
  RETURN v_count;
END;
$$;

-- ----- Tests : linkedin_events ---------------------------------------------

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'linkedin_events'),
  'RLS active sur linkedin_events'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'linkedin_mapping_rules'),
  'RLS active sur linkedin_mapping_rules'
);

SELECT is(
  pg_temp.select_count_event_as((SELECT admin_id FROM _ctx), (SELECT event_id FROM _ctx)),
  1, 'Admin peut SELECT un évènement LinkedIn'
);

SELECT is(
  pg_temp.select_count_event_as((SELECT pipe_id FROM _ctx), (SELECT event_id FROM _ctx)),
  1, 'User avec pipeline_access peut SELECT un évènement'
);

SELECT is(
  pg_temp.select_count_event_as((SELECT noacc_id FROM _ctx), (SELECT event_id FROM _ctx)),
  0, 'User sans pipeline_access ne voit PAS les évènements'
);

SELECT is(
  pg_temp.insert_event_as((SELECT pipe_id FROM _ctx)),
  -1, 'User pipeline NON-admin ne peut PAS INSERT un évènement (WITH CHECK is_admin)'
);

SELECT is(
  pg_temp.insert_event_as((SELECT admin_id FROM _ctx)),
  1, 'Admin peut INSERT un évènement'
);

-- ----- Tests : linkedin_mapping_rules --------------------------------------

SELECT is(
  pg_temp.select_count_rule_as((SELECT pipe_id FROM _ctx), (SELECT rule_id FROM _ctx)),
  1, 'User avec pipeline_access peut SELECT une règle de mapping'
);

SELECT is(
  pg_temp.select_count_rule_as((SELECT noacc_id FROM _ctx), (SELECT rule_id FROM _ctx)),
  0, 'User sans pipeline_access ne voit PAS les règles de mapping'
);

SELECT is(
  pg_temp.insert_rule_as((SELECT pipe_id FROM _ctx), 'globex'),
  -1, 'User pipeline NON-admin ne peut PAS INSERT une règle (écriture = Direction)'
);

SELECT is(
  pg_temp.insert_rule_as((SELECT admin_id FROM _ctx), 'initech'),
  1, 'Admin peut INSERT une règle de mapping'
);

SELECT * FROM finish();
ROLLBACK;

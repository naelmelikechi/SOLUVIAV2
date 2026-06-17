-- ===========================================================================
-- Test : RLS sur cdp_affectation_history (Feature 7 — Référent CDP)
-- ===========================================================================
-- Migration : 20260615160900_referent_cdp.sql
--
-- Spec :
--   SELECT : is_admin() OU has_pipeline_access()
--   INSERT : is_referent_cdp()  (referent_cdp = true OU rôle admin/superadmin)
--   DELETE : is_admin()
--
-- Invariant clé : l'écriture de l'historique d'affectation est réservée aux
-- Référents CDP (et à la Direction), pas à tout le pipeline.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

-- ----- Setup (superuser -> bypass RLS) -------------------------------------
CREATE TEMP TABLE _ctx (
  admin_id UUID, pipe_id UUID, ref_id UUID, noacc_id UUID,
  client_id UUID, hist_id UUID
);
INSERT INTO _ctx (admin_id, pipe_id, ref_id, noacc_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-cdp@test.local' FROM _ctx
UNION ALL SELECT pipe_id,  'pipe-cdp@test.local'  FROM _ctx
UNION ALL SELECT ref_id,   'ref-cdp@test.local'   FROM _ctx
UNION ALL SELECT noacc_id, 'noacc-cdp@test.local' FROM _ctx;

-- pipe : pipeline_access mais PAS référent (cas « cdp sans referent »).
-- ref  : référent CDP (cdp + referent_cdp = true) -> seul à pouvoir INSERT.
INSERT INTO public.users (id, email, prenom, nom, role, pipeline_access, referent_cdp)
SELECT admin_id, 'admin-cdp@test.local', 'Admin', 'CDP', 'admin'::role_utilisateur, false, false FROM _ctx
UNION ALL
SELECT pipe_id,  'pipe-cdp@test.local',  'Pipe',  'CDP', 'cdp'::role_utilisateur, true,  false FROM _ctx
UNION ALL
SELECT ref_id,   'ref-cdp@test.local',   'Ref',   'CDP', 'cdp'::role_utilisateur, true,  true  FROM _ctx
UNION ALL
SELECT noacc_id, 'noacc-cdp@test.local', 'Noacc', 'CDP', 'cdp'::role_utilisateur, false, false FROM _ctx;

-- Client de référence (clients exige trigramme UNIQUE + raison_sociale).
DO $$
DECLARE v_client UUID; v_hist UUID;
BEGIN
  INSERT INTO clients (trigramme, raison_sociale)
    VALUES ('RLS', 'Client RLS CDP')
    RETURNING id INTO v_client;
  INSERT INTO cdp_affectation_history (client_id, to_cdp_id)
    VALUES (v_client, (SELECT ref_id FROM _ctx))
    RETURNING id INTO v_hist;
  UPDATE _ctx SET client_id = v_client, hist_id = v_hist;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.select_count_as(p_user_id UUID, p_hist_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  SELECT count(*)::int INTO v_count
    FROM public.cdp_affectation_history WHERE id = p_hist_id;
  RESET role;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_as(p_user_id UUID, p_client_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  BEGIN
    INSERT INTO public.cdp_affectation_history (client_id) VALUES (p_client_id);
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
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'cdp_affectation_history'),
  'RLS active sur cdp_affectation_history'
);

SELECT is(
  pg_temp.select_count_as((SELECT admin_id FROM _ctx), (SELECT hist_id FROM _ctx)),
  1, 'Admin peut SELECT une ligne d''historique'
);

SELECT is(
  pg_temp.select_count_as((SELECT pipe_id FROM _ctx), (SELECT hist_id FROM _ctx)),
  1, 'User avec pipeline_access peut SELECT une ligne d''historique'
);

SELECT is(
  pg_temp.select_count_as((SELECT noacc_id FROM _ctx), (SELECT hist_id FROM _ctx)),
  0, 'User sans pipeline_access ne voit PAS l''historique'
);

SELECT is(
  pg_temp.insert_as((SELECT ref_id FROM _ctx), (SELECT client_id FROM _ctx)),
  1, 'Référent CDP peut INSERT une affectation'
);

SELECT is(
  pg_temp.insert_as((SELECT pipe_id FROM _ctx), (SELECT client_id FROM _ctx)),
  -1, 'CDP sans flag référent ne peut PAS INSERT (is_referent_cdp refuse)'
);

SELECT * FROM finish();
ROLLBACK;

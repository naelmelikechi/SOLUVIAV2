-- ===========================================================================
-- Test : count_factures_by_statut() (RPC de comptage du pie chart dashboard)
-- ===========================================================================
-- Migration : 20260630150100_count_factures_by_statut_rpc.sql
-- Verifie : SECURITY INVOKER (prosecdef=false), search_path epingle, grants
-- (authenticated oui / anon non), scoping RLS admin (global) vs cdp (ses
-- projets), exclusion de 'a_emettre'.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(8);

CREATE TEMP TABLE _ctx (
  admin_id UUID, cdp_id UUID, client_id UUID, projet_cdp_id UUID, libre_id UUID,
  base_emise BIGINT, base_avoir BIGINT
);
INSERT INTO _ctx (admin_id, cdp_id, client_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-count@test.local' FROM _ctx
UNION ALL SELECT cdp_id, 'cdp-count@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role)
SELECT admin_id, 'admin-count@test.local', 'Admin', 'Count', 'admin'::role_utilisateur FROM _ctx
UNION ALL SELECT cdp_id, 'cdp-count@test.local', 'Cdp', 'Count', 'cdp'::role_utilisateur FROM _ctx;

INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Count Factures', 'TCF', false, false FROM _ctx;

-- Projet du CDP (cdp_id renseigne => le cdp le voit via RLS).
UPDATE _ctx SET projet_cdp_id = gen_random_uuid();
INSERT INTO projets (id, client_id, typologie_id, cdp_id, statut, archive, taux_commission)
SELECT projet_cdp_id, client_id,
       (SELECT id FROM typologies_projet WHERE code = 'LIB'),
       cdp_id, 'actif', false, 10
FROM _ctx;

-- Projet libre (cdp_id NULL => le cdp ne le voit PAS).
UPDATE _ctx SET libre_id = get_or_create_projet_libre((SELECT client_id FROM _ctx));


-- Baseline : le seed de demo peut deja contenir des factures (emise/avoir).
-- On capture le total global AVANT nos fixtures pour asserter en DELTA (test
-- seed-independant ; l'admin voit le global via is_admin).
UPDATE _ctx SET
  base_emise = (SELECT count(*) FROM factures WHERE statut = 'emise'),
  base_avoir = (SELECT count(*) FROM factures WHERE statut = 'avoir');
-- Seed factures. Sur le projet DU CDP : 1 emise + 1 payee.
INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      ref, numero_seq, societe_emettrice_id)
SELECT projet_cdp_id, client_id, '2026-05-01', '2026-06-30', '2026-05',
       100, 20, 20, 120, 'emise', false, 'FAC-TCF-9001', 990001,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx;

INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      ref, numero_seq, societe_emettrice_id)
SELECT projet_cdp_id, client_id, '2026-05-01', '2026-06-30', '2026-05',
       200, 20, 40, 240, 'payee', false, 'FAC-TCF-9002', 990002,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx;

-- Sur le projet libre (invisible au cdp) : 1 emise + 1 avoir + 1 a_emettre.
INSERT INTO factures (id, projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      ref, numero_seq, societe_emettrice_id)
SELECT '00000000-0000-0000-0000-0000000cf001', libre_id, client_id, '2026-05-01', '2026-06-30', '2026-05',
       300, 20, 60, 360, 'emise', false, 'FAC-TCF-9003', 990003,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx;

INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      avoir_motif, facture_origine_id,
                      ref, numero_seq, societe_emettrice_id)
SELECT libre_id, client_id, '2026-05-02', '2026-06-30', '2026-05',
       -300, 20, -60, -360, 'avoir', true,
       'Annulation test', '00000000-0000-0000-0000-0000000cf001',
       'FAC-TCF-9004', 990004,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx;

-- Brouillon (a_emettre) : ni ref ni numero_seq, jamais compte.
INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      societe_emettrice_id)
SELECT libre_id, client_id, '2026-05-03', '2026-06-30', '2026-05',
       50, 20, 10, 60, 'a_emettre', false,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx;

-- ----- 1. SECURITY INVOKER (prosecdef = false) -----
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'count_factures_by_statut'),
  false, 'count_factures_by_statut est SECURITY INVOKER (prosecdef=false)');

-- ----- 2. search_path epingle -----
SELECT ok(
  (SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE proname = 'count_factures_by_statut')
  LIKE '%search_path=public, pg_catalog%', 'search_path epingle sur public, pg_catalog');

-- ----- 3-4. Grants : authenticated oui, anon non -----
SELECT ok(
  has_function_privilege('authenticated', 'public.count_factures_by_statut()', 'EXECUTE'),
  'authenticated peut EXECUTE');
SELECT ok(
  NOT has_function_privilege('anon', 'public.count_factures_by_statut()', 'EXECUTE'),
  'anon ne peut PAS EXECUTE');

-- ----- Helper : exécute le RPC sous une identite donnee, renvoie n pour un statut -----
CREATE OR REPLACE FUNCTION pg_temp.count_as(p_user UUID, p_statut statut_facture)
RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE v bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  SELECT COALESCE((SELECT n FROM public.count_factures_by_statut() WHERE statut = p_statut), 0) INTO v;
  RESET role;
  RETURN v;
END; $f$;

-- ----- 5. Admin voit le total global (2 emise : projet cdp + projet libre) -----
SELECT is( pg_temp.count_as((SELECT admin_id FROM _ctx), 'emise'::statut_facture),
  (SELECT base_emise FROM _ctx) + 2,
  'Admin : count emise global = baseline seed + 2 fixtures (projet cdp + projet libre)');

-- ----- 6. Admin voit l'avoir (1) -----
SELECT is( pg_temp.count_as((SELECT admin_id FROM _ctx), 'avoir'::statut_facture),
  (SELECT base_avoir FROM _ctx) + 1,
  'Admin : count avoir global = baseline seed + 1 fixture');

-- ----- 7. CDP ne voit QUE ses projets (1 emise, pas celle du projet libre) -----
SELECT is( pg_temp.count_as((SELECT cdp_id FROM _ctx), 'emise'::statut_facture), 1::bigint,
  'CDP : count emise scope a ses projets (RLS via SECURITY INVOKER)');

-- ----- 8. Exclusion 'a_emettre' : jamais compte, meme pour l'admin -----
SELECT is( pg_temp.count_as((SELECT admin_id FROM _ctx), 'a_emettre'::statut_facture), 0::bigint,
  'a_emettre exclu du comptage (jamais dans le breakdown)');

SELECT * FROM finish();
ROLLBACK;

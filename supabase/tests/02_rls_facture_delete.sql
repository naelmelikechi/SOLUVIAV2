-- ===========================================================================
-- Test : RLS DELETE policy sur factures (sprint 6)
-- ===========================================================================
-- Migration : 20260507130000_factures_delete_brouillon_policy.sql
--
-- Spec :
--   - DELETE autorise uniquement quand statut = 'a_emettre' (brouillon)
--   - DELETE autorise uniquement pour admin/superadmin (is_admin())
--   - Les CDP ne peuvent pas DELETE (meme leurs propres brouillons)
--   - Les emises/avoir/payee ne peuvent JAMAIS etre supprimees
--     (garantie gapless legale - art. 289 CGI)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(5);

-- ----- Setup : 1 admin + 1 cdp + 1 brouillon + 1 facture emise -------------
CREATE TEMP TABLE _ctx (
  admin_id UUID,
  cdp_id UUID,
  brouillon_id UUID,
  emise_id UUID
);

INSERT INTO _ctx (admin_id, cdp_id) VALUES (gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-rls@test.local' FROM _ctx
UNION ALL
SELECT cdp_id, 'cdp-rls@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role)
SELECT admin_id, 'admin-rls@test.local', 'Admin', 'RLS', 'admin'::role_utilisateur FROM _ctx
UNION ALL
SELECT cdp_id, 'cdp-rls@test.local', 'Cdp', 'RLS', 'cdp'::role_utilisateur FROM _ctx;

-- 1 client + 1 projet + 2 factures (brouillon + emise)
DO $$
DECLARE
  v_client_id UUID := gen_random_uuid();
  v_projet_id UUID := gen_random_uuid();
  v_typo UUID := (SELECT id FROM typologies_projet LIMIT 1);
  v_brouillon UUID;
  v_emise UUID;
  v_admin UUID := (SELECT admin_id FROM _ctx);
BEGIN
  INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
    VALUES (v_client_id, 'Test RLS DEL', 'RLD', false, false);
  INSERT INTO projets (id, client_id, typologie_id, ref, statut, est_interne, archive, cdp_id)
    VALUES (v_projet_id, v_client_id, v_typo, 'RLD-PROJ', 'actif', false, false, (SELECT cdp_id FROM _ctx));

  INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                        montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                        societe_emettrice_id)
    VALUES (v_projet_id, v_client_id, '2026-05-01', '2026-06-30', '2026-05',
            100, 20, 20, 120, 'a_emettre', false,
            (SELECT id FROM societes_emettrices WHERE code = 'SOL'))
    RETURNING id INTO v_brouillon;

  -- Pour creer une "emise", on insert directement avec statut='emise' + ref
  -- (bypass le trigger qui exige a_emettre -> emise via UPDATE).
  INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                        montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                        ref, numero_seq, societe_emettrice_id)
    VALUES (v_projet_id, v_client_id, '2026-05-01', '2026-06-30', '2026-05',
            200, 20, 40, 240, 'emise', false,
            'FAC-RLD-9999', 999999,
            (SELECT id FROM societes_emettrices WHERE code = 'SOL'))
    RETURNING id INTO v_emise;

  UPDATE _ctx SET brouillon_id = v_brouillon, emise_id = v_emise;
END $$;

-- ----- Helper : execute un DELETE sous l identite d un user (RLS active) ---
CREATE OR REPLACE FUNCTION pg_temp.try_delete_as(
  p_user_id UUID,
  p_facture_id UUID
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- On run la requete dans une sous-transaction sous role authenticated
  -- avec un faux JWT pointant sur p_user_id.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;

  WITH d AS (DELETE FROM public.factures WHERE id = p_facture_id RETURNING id)
  SELECT count(*) INTO v_count FROM d;

  RESET role;
  RETURN v_count;
END;
$$;

-- ----- Tests ---------------------------------------------------------------

-- Test 1 : admin peut delete un brouillon
SELECT is(
  pg_temp.try_delete_as((SELECT admin_id FROM _ctx), (SELECT brouillon_id FROM _ctx)),
  1,
  'Admin peut DELETE un brouillon (statut=a_emettre)'
);

-- Re-cree un brouillon (il a ete consume par le test 1)
DO $$
DECLARE
  v_id UUID;
  v_projet UUID := (SELECT id FROM projets WHERE ref='RLD-PROJ');
  v_client UUID := (SELECT client_id FROM projets WHERE ref='RLD-PROJ');
BEGIN
  INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                        montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                        societe_emettrice_id)
    VALUES (v_projet, v_client, '2026-05-01', '2026-06-30', '2026-05',
            100, 20, 20, 120, 'a_emettre', false,
            (SELECT id FROM societes_emettrices WHERE code = 'SOL'))
    RETURNING id INTO v_id;
  UPDATE _ctx SET brouillon_id = v_id;
END $$;

-- Test 2 : cdp ne peut PAS delete un brouillon (meme du projet dont il est cdp)
SELECT is(
  pg_temp.try_delete_as((SELECT cdp_id FROM _ctx), (SELECT brouillon_id FROM _ctx)),
  0,
  'CDP ne peut pas DELETE un brouillon (admin-only)'
);

-- Test 3 : admin ne peut PAS delete une facture emise (gapless)
SELECT is(
  pg_temp.try_delete_as((SELECT admin_id FROM _ctx), (SELECT emise_id FROM _ctx)),
  0,
  'Admin ne peut pas DELETE une facture emise (gapless preserve)'
);

-- Test 4 : la facture emise existe toujours apres tentative de delete
SELECT ok(
  EXISTS (SELECT 1 FROM factures WHERE id = (SELECT emise_id FROM _ctx)),
  'Facture emise existe toujours apres tentative DELETE'
);

-- Test 5 : le brouillon existe toujours apres tentative DELETE par CDP
SELECT ok(
  EXISTS (SELECT 1 FROM factures WHERE id = (SELECT brouillon_id FROM _ctx)),
  'Brouillon existe toujours apres tentative DELETE par CDP'
);

SELECT * FROM finish();
ROLLBACK;

-- ===========================================================================
-- Test : delete_user_cascade RPC (sprint 6, lie au sprint 5 #5)
-- ===========================================================================
-- Migration : 20260507120000_delete_user_cascade.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(7);

-- ----- Setup ---------------------------------------------------------------
CREATE TEMP TABLE _ctx (
  superadmin_id UUID,
  admin_id UUID,
  target_id UUID,
  client_id UUID,
  projet_id UUID
);

INSERT INTO _ctx (superadmin_id, admin_id, target_id, client_id, projet_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
        gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT superadmin_id, 'sa@test.local' FROM _ctx
UNION ALL
SELECT admin_id, 'a@test.local' FROM _ctx
UNION ALL
SELECT target_id, 'tgt@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role)
SELECT superadmin_id, 'sa@test.local', 'Sa', 'Test', 'superadmin'::role_utilisateur FROM _ctx
UNION ALL
SELECT admin_id, 'a@test.local', 'Ad', 'Test', 'admin'::role_utilisateur FROM _ctx
UNION ALL
SELECT target_id, 'tgt@test.local', 'Tg', 'Test', 'cdp'::role_utilisateur FROM _ctx;

-- Donnees attachees au target qu'on veut voir nettoyees
INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Cascade', 'CSC', false, false FROM _ctx;

INSERT INTO projets (id, client_id, typologie_id, ref, statut, est_interne, archive,
                    cdp_id, backup_cdp_id)
-- cdp_id et backup_cdp_id doivent etre differents (chk_cdp_different).
-- On utilise admin_id comme backup pour avoir 2 references distinctes
-- au target via cdp_id et qu'apres cascade, les 2 references soient
-- nullifiees. Ajout d un autre projet ou seul le backup pointe target.
SELECT projet_id, client_id, (SELECT id FROM typologies_projet LIMIT 1),
       'CSC-PROJ', 'actif', false, false, target_id, admin_id
FROM _ctx;
INSERT INTO projets (id, client_id, typologie_id, ref, statut, est_interne, archive,
                    cdp_id, backup_cdp_id)
SELECT gen_random_uuid(), client_id, (SELECT id FROM typologies_projet LIMIT 1),
       'CSC-PROJ-2', 'actif', false, false, admin_id, target_id
FROM _ctx;

INSERT INTO notifications (user_id, type, titre, message)
SELECT target_id, 'facture_retard', 'T', 'M' FROM _ctx;

INSERT INTO saisies_temps (user_id, projet_id, date, heures)
SELECT target_id, projet_id, '2026-05-01', 7 FROM _ctx;

INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc,
                      statut, est_avoir, created_by)
SELECT projet_id, client_id, '2026-05-01', '2026-06-30', '2026-05',
       100, 20, 20, 120, 'a_emettre', false, target_id
FROM _ctx;

-- Helper : execute le RPC sous l identite d un user
CREATE OR REPLACE FUNCTION pg_temp.run_cascade_as(p_caller UUID, p_target UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_err TEXT;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_caller, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;

  BEGIN
    PERFORM delete_user_cascade(p_target);
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  RESET role;
  RETURN v_err;
END;
$$;

-- ----- Tests ---------------------------------------------------------------

-- Test 1 : caller admin (non superadmin) -> RAISE
SELECT ok(
  pg_temp.run_cascade_as((SELECT admin_id FROM _ctx), (SELECT target_id FROM _ctx))
    LIKE '%superadmins%',
  'Caller admin (non superadmin) refuse avec message explicite'
);

-- Test 2 : superadmin essayant de se supprimer soi-meme -> RAISE
SELECT ok(
  pg_temp.run_cascade_as((SELECT superadmin_id FROM _ctx), (SELECT superadmin_id FROM _ctx))
    LIKE '%soi-meme%',
  'Superadmin ne peut pas se supprimer lui-meme'
);

-- ----- Test 3-7 : caller superadmin avec target valide -------------------
SELECT is(
  pg_temp.run_cascade_as((SELECT superadmin_id FROM _ctx), (SELECT target_id FROM _ctx)),
  NULL::text,
  'Superadmin sur target valide reussit (pas d exception)'
);

-- target supprime de public.users
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT target_id FROM _ctx)),
  'Target supprime de public.users'
);

-- notifications du target supprimees
SELECT ok(
  NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = (SELECT target_id FROM _ctx)),
  'Notifications du target supprimees'
);

-- projets.cdp_id du target -> NULL (pas le projet lui-meme)
SELECT ok(
  EXISTS (SELECT 1 FROM projets
          WHERE id = (SELECT projet_id FROM _ctx) AND cdp_id IS NULL),
  'projets.cdp_id mis a NULL (projet preserve)'
);

-- factures.created_by du target -> NULL (pas la facture)
SELECT ok(
  EXISTS (SELECT 1 FROM factures
          WHERE projet_id = (SELECT projet_id FROM _ctx) AND created_by IS NULL),
  'factures.created_by mis a NULL (facture preserve)'
);

SELECT * FROM finish();
ROLLBACK;

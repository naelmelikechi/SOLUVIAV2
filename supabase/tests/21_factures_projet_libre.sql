-- ===========================================================================
-- Test : factures + projet libre (verrou NOT NULL, RLS, backfill vs gel)
-- ===========================================================================
-- Migrations : 20260630120000_projets_libre.sql,
--              20260630120500_factures_backfill_projet_libre_notnull.sql
-- Spec : sections 5 (backfill + trigger gel), RLS (visibilite), 6 (verrou)

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(5);

CREATE TEMP TABLE _ctx (
  admin_id UUID, cdp_id UUID, client_id UUID, libre_id UUID
);
INSERT INTO _ctx (admin_id, cdp_id, client_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-libre@test.local' FROM _ctx
UNION ALL SELECT cdp_id, 'cdp-libre@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role)
SELECT admin_id, 'admin-libre@test.local', 'Admin', 'Libre', 'admin'::role_utilisateur FROM _ctx
UNION ALL SELECT cdp_id, 'cdp-libre@test.local', 'Cdp', 'Libre', 'cdp'::role_utilisateur FROM _ctx;

INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Facture Libre', 'TFL', false, false FROM _ctx;

-- ----- Assertion 1 : verrou NOT NULL (insert sans projet_id => 23502) -----
SELECT throws_ok($$
  INSERT INTO factures (client_id, date_emission, date_echeance, mois_concerne,
                        montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                        societe_emettrice_id)
  SELECT client_id, '2026-05-01', '2026-06-30', '2026-05',
         100, 20, 20, 120, 'a_emettre', false,
         (SELECT id FROM societes_emettrices WHERE code='SOL') FROM _ctx
$$, '23502', NULL, 'Insert facture sans projet_id : not_null_violation (verrou actif)');

-- ----- Assertions 2-3 : RLS visibilite (CDP ne voit pas une facture libre) -
UPDATE _ctx SET libre_id = get_or_create_projet_libre((SELECT client_id FROM _ctx));

INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      ref, numero_seq, societe_emettrice_id)
SELECT libre_id, client_id, '2026-05-01', '2026-06-30', '2026-05',
       300, 20, 60, 360, 'emise', false,
       'FAC-TFL-9998', 999998,
       (SELECT id FROM societes_emettrices WHERE code='SOL') FROM _ctx;

CREATE OR REPLACE FUNCTION pg_temp.count_visible_facture_as(p_user_id UUID, p_ref TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_count FROM public.factures WHERE ref = p_ref;
  RESET role;
  RETURN v_count;
END; $$;

SELECT is(
  pg_temp.count_visible_facture_as((SELECT cdp_id FROM _ctx), 'FAC-TFL-9998'),
  0, 'CDP ne voit PAS une facture libre (projet libre cdp_id NULL)');

SELECT is(
  pg_temp.count_visible_facture_as((SELECT admin_id FROM _ctx), 'FAC-TFL-9998'),
  1, 'Admin voit la facture libre');

-- ----- Assertions 4-5 : backfill d'une facture EMISE orpheline malgre le gel
-- Simule l'etat pre-backfill en levant temporairement le NOT NULL (rollback en
-- fin de transaction). Reproduit la logique exacte de la migration de backfill.
ALTER TABLE factures ALTER COLUMN projet_id DROP NOT NULL;

INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      ref, numero_seq, societe_emettrice_id)
SELECT NULL, client_id, '2026-04-01', '2026-05-31', '2026-04',
       150, 20, 30, 180, 'emise', false,
       'FAC-TFL-8888', 999997,
       (SELECT id FROM societes_emettrices WHERE code='SOL') FROM _ctx;

ALTER TABLE factures DISABLE TRIGGER trg_factures_freeze_after_emission;
SELECT get_or_create_projet_libre(c.client_id)
FROM (SELECT DISTINCT client_id FROM factures WHERE projet_id IS NULL) c;
UPDATE factures f SET projet_id = p.id FROM projets p
WHERE f.projet_id IS NULL AND p.client_id = f.client_id AND p.est_libre;
ALTER TABLE factures ENABLE TRIGGER trg_factures_freeze_after_emission;

SELECT isnt(
  (SELECT projet_id FROM factures WHERE ref='FAC-TFL-8888'), NULL,
  'Backfill : facture emise orpheline recoit un projet_id malgre le trigger de gel');

SELECT is(
  (SELECT p.est_libre FROM factures f JOIN projets p ON p.id=f.projet_id
   WHERE f.ref='FAC-TFL-8888'),
  true, 'Backfill : le projet affecte est un projet libre');

SELECT * FROM finish();
ROLLBACK;

-- ===========================================================================
-- Test : production_month_sums() + contrats_actifs_fenetre() (RPC agregats
-- production partagees dashboard / production / cron rapport mensuel)
-- ===========================================================================
-- Migrations : 20260702130000_production_month_sums_rpc.sql
--            + 20260804090000_production_month_sums_net_avoirs.sql
-- Verifie : SECURITY INVOKER, search_path epingle, grants (authenticated +
-- service_role oui / anon non), formats mixtes de mois_concerne ('YYYY-MM' et
-- 'YYYY-MM-01' bucketises dans le meme mois), semantique NETTE (avoirs emis
-- deduits, brouillons a_emettre exclus, en_retard = solde apres avoirs lies),
-- exclusion clients demo / clients archives, prorata HT de l'encaisse (y
-- compris ttc = 0 => ratio 1), fenetre contrats (termine avant exclu, a
-- cheval inclus, versement OPCO M+duree+1 couvert par le +2, demarre apres
-- exclu, demo/archive exclus).
-- Les fixtures utilisent des mois en 2031 et des NPEC marqueurs pour etre
-- independantes du seed.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(18);

-- ----- Fixtures -----
CREATE TEMP TABLE _ctx (
  client_id UUID, client_demo_id UUID, client_arch_id UUID,
  projet_id UUID, projet_demo_id UUID, projet_arch_id UUID,
  f1_id UUID, f8_id UUID
);
INSERT INTO _ctx (client_id, client_demo_id, client_arch_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Agregats Prod', 'TG1', false, false FROM _ctx
UNION ALL SELECT client_demo_id, 'Test Agregats Demo', 'TG2', true, false FROM _ctx
UNION ALL SELECT client_arch_id, 'Test Agregats Archive', 'TG3', false, true FROM _ctx;

UPDATE _ctx SET
  projet_id      = get_or_create_projet_libre(client_id),
  projet_demo_id = get_or_create_projet_libre(client_demo_id),
  projet_arch_id = get_or_create_projet_libre(client_arch_id),
  f1_id          = gen_random_uuid(),
  f8_id          = gen_random_uuid();

-- Factures du mois 2031-03 (formats mixtes) sur le client normal :
--   F1 'YYYY-MM'    100 HT / 120 TTC, emise      -> facture
--   F2 'YYYY-MM-01'  50 HT /  60 TTC, en_retard  -> facture + en_retard
--   F3 avoir emis   -30 HT / -36 TTC (origine F1) -> DEDUIT de facture
--   F6 0 HT / 0 TTC, emise (cas ttc=0)           -> facture (+0)
--   F7 mois 2031-02                              -> hors fenetre
--   F8  80 HT, en_retard + F9 avoir emis -80 (origine F8)
--       -> facture net +0, en_retard net 0 (soldee par avoir)
--   F10 999 HT brouillon a_emettre               -> exclue (brouillon)
-- Et 500 HT client demo (F4) + 700 HT client archive (F5) -> exclues.
INSERT INTO factures (id, projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      ref, numero_seq, societe_emettrice_id)
SELECT f1_id, projet_id, client_id, '2031-03-01'::date, '2031-04-30'::date, '2031-03',
       100, 20, 20, 120, 'emise'::statut_facture, false, 'FAC-TG1-9101', 991101,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx;

INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      ref, numero_seq, societe_emettrice_id)
SELECT projet_id, client_id, '2031-03-01'::date, '2031-04-30'::date, '2031-03-01',
       50, 20, 10, 60, 'en_retard'::statut_facture, false, 'FAC-TG1-9102', 991102,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx
UNION ALL
SELECT projet_id, client_id, '2031-03-05'::date, '2031-04-30'::date, '2031-03',
       0, 20, 0, 0, 'emise'::statut_facture, false, 'FAC-TG1-9104', 991104,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx
UNION ALL
SELECT projet_id, client_id, '2031-02-01'::date, '2031-03-31'::date, '2031-02-01',
       999, 20, 199.80, 1198.80, 'emise'::statut_facture, false, 'FAC-TG1-9107', 991107,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx
UNION ALL
SELECT projet_demo_id, client_demo_id, '2031-03-01'::date, '2031-04-30'::date, '2031-03',
       500, 20, 100, 600, 'emise'::statut_facture, false, 'FAC-TG2-9105', 991105,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx
UNION ALL
SELECT projet_arch_id, client_arch_id, '2031-03-01'::date, '2031-04-30'::date, '2031-03',
       700, 20, 140, 840, 'emise'::statut_facture, false, 'FAC-TG3-9106', 991106,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx;

-- F8 : en retard, integralement soldee par l'avoir F9 ci-dessous.
INSERT INTO factures (id, projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      ref, numero_seq, societe_emettrice_id)
SELECT f8_id, projet_id, client_id, '2031-03-02'::date, '2031-04-30'::date, '2031-03',
       80, 20, 16, 96, 'en_retard'::statut_facture, false, 'FAC-TG1-9108', 991108,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx;

-- F10 : brouillon (a_emettre), doit etre EXCLU du facture.
INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      societe_emettrice_id)
SELECT projet_id, client_id, '2031-03-20'::date, '2031-04-30'::date, '2031-03',
       999, 20, 199.80, 1198.80, 'a_emettre'::statut_facture, false,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx;

-- Avoirs emis : F3 (-30, origine F1) et F9 (-80, origine F8, solde F8 a 0).
INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      avoir_motif, facture_origine_id, ref, numero_seq, societe_emettrice_id)
SELECT projet_id, client_id, '2031-03-10'::date, '2031-04-30'::date, '2031-03',
       -30, 20, -6, -36, 'avoir'::statut_facture, true, 'Avoir test agregats',
       f1_id, 'FAC-TG1-9103', 991103,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx
UNION ALL
SELECT projet_id, client_id, '2031-03-11'::date, '2031-04-30'::date, '2031-03',
       -80, 20, -16, -96, 'avoir'::statut_facture, true, 'Avoir solde totale',
       f8_id, 'FAC-TG1-9109', 991109,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL') FROM _ctx;

-- Paiements :
--   60 sur F1 (120 TTC / 100 HT)  -> 60 * 100/120 = 50 HT
--   30 sur F2 ( 60 TTC /  50 HT)  -> 30 *  50/60  = 25 HT
--   30 sur F6 (TTC = 0)           -> ratio 1      = 30 HT
--   100 sur la facture demo       -> exclu
INSERT INTO paiements (facture_id, montant, date_reception)
SELECT id, 60, '2031-03-15'::date FROM factures WHERE ref = 'FAC-TG1-9101'
UNION ALL SELECT id, 30, '2031-03-16'::date FROM factures WHERE ref = 'FAC-TG1-9102'
UNION ALL SELECT id, 30, '2031-03-17'::date FROM factures WHERE ref = 'FAC-TG1-9104'
UNION ALL SELECT id, 100, '2031-03-18'::date FROM factures WHERE ref = 'FAC-TG2-9105';

-- Contrats (fenetre testee : [2031-06-01, 2031-07-01)). NPEC marqueurs :
--   111111 termine avant (2030-01 + 12 mois, +2 => 2031-03 < 2031-06) -> EXCLU
--   222222 a cheval (2031-01, 12 mois)                                -> INCLUS
--   333333 dernier versement OPCO M+13 = 2031-06 (couvert par le +2)  -> INCLUS
--   444444 demarre a p_next (2031-07-01)                              -> EXCLU
--   555555 client demo                                                -> EXCLU
--   666666 contrat archive                                            -> EXCLU
--   777777 client archive                                             -> EXCLU
INSERT INTO contrats (eduvia_id, projet_id, date_debut, duree_mois, npec_amount, archive)
SELECT 99310001, projet_id,      '2030-01-01'::date, 12, 111111, false FROM _ctx
UNION ALL SELECT 99310002, projet_id,      '2031-01-01'::date, 12, 222222, false FROM _ctx
UNION ALL SELECT 99310003, projet_id,      '2030-05-01'::date, 12, 333333, false FROM _ctx
UNION ALL SELECT 99310004, projet_id,      '2031-07-01'::date, 12, 444444, false FROM _ctx
UNION ALL SELECT 99310005, projet_demo_id, '2031-06-01'::date, 12, 555555, false FROM _ctx
UNION ALL SELECT 99310006, projet_id,      '2031-06-01'::date, 12, 666666, true  FROM _ctx
UNION ALL SELECT 99310007, projet_arch_id, '2031-06-01'::date, 12, 777777, false FROM _ctx;

-- ----- 1-2. production_month_sums : SECURITY INVOKER + search_path -----
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'production_month_sums'),
  false, 'production_month_sums est SECURITY INVOKER (prosecdef=false)');
SELECT ok(
  (SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE proname = 'production_month_sums')
  LIKE '%search_path=public, pg_catalog%',
  'production_month_sums : search_path epingle sur public, pg_catalog');

-- ----- 3-5. production_month_sums : grants -----
SELECT ok(
  has_function_privilege('authenticated', 'public.production_month_sums(text, text)', 'EXECUTE'),
  'production_month_sums : authenticated peut EXECUTE');
SELECT ok(
  NOT has_function_privilege('anon', 'public.production_month_sums(text, text)', 'EXECUTE'),
  'production_month_sums : anon ne peut PAS EXECUTE');
SELECT ok(
  has_function_privilege('service_role', 'public.production_month_sums(text, text)', 'EXECUTE'),
  'production_month_sums : service_role peut EXECUTE (cron admin client)');

-- ----- 6-7. contrats_actifs_fenetre : SECURITY INVOKER + search_path -----
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname = 'contrats_actifs_fenetre'),
  false, 'contrats_actifs_fenetre est SECURITY INVOKER (prosecdef=false)');
SELECT ok(
  (SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE proname = 'contrats_actifs_fenetre')
  LIKE '%search_path=public, pg_catalog%',
  'contrats_actifs_fenetre : search_path epingle sur public, pg_catalog');

-- ----- 8-10. contrats_actifs_fenetre : grants -----
SELECT ok(
  has_function_privilege('authenticated', 'public.contrats_actifs_fenetre(date, date)', 'EXECUTE'),
  'contrats_actifs_fenetre : authenticated peut EXECUTE');
SELECT ok(
  NOT has_function_privilege('anon', 'public.contrats_actifs_fenetre(date, date)', 'EXECUTE'),
  'contrats_actifs_fenetre : anon ne peut PAS EXECUTE');
SELECT ok(
  has_function_privilege('service_role', 'public.contrats_actifs_fenetre(date, date)', 'EXECUTE'),
  'contrats_actifs_fenetre : service_role peut EXECUTE (cron admin client)');

-- ----- 11. Formats mixtes + fenetre : un seul bucket '2031-03' -----
-- '2031-03' et '2031-03-01' tombent dans le meme mois ; la facture 2031-02
-- est hors bornes [p_first, p_next).
SELECT is(
  (SELECT count(*) FROM production_month_sums('2031-03', '2031-04')),
  1::bigint,
  'formats mixtes bucketises ensemble + fenetre : 1 seule ligne pour 2031-03');

-- ----- 12. facture NETTE : 100 + 50 + 0 + 80 - 30 - 80 = 120 -----
-- Avoirs emis deduits, brouillon a_emettre (999) exclu, demo/archive exclus.
SELECT is(
  (SELECT facture FROM production_month_sums('2031-03', '2031-04') WHERE mois = '2031-03'),
  120::numeric,
  'facture = 120 (nette des avoirs emis ; brouillons, client demo et client archive exclus)');

-- ----- 13. en_retard NET : F2 (50) seule ; F8 soldee par avoir -> 0 -----
SELECT is(
  (SELECT en_retard FROM production_month_sums('2031-03', '2031-04') WHERE mois = '2031-03'),
  50::numeric,
  'en_retard = 50 (solde apres avoirs lies : F8 soldee par F9 ne pese plus)');

-- ----- 14. encaisse : prorata HT 50 + 25 + 30 (ttc=0 => ratio 1), demo exclu -----
SELECT is(
  (SELECT encaisse FROM production_month_sums('2031-03', '2031-04') WHERE mois = '2031-03'),
  105::numeric,
  'encaisse = 105 (60*100/120 + 30*50/60 + 30*1 ; paiement client demo exclu)');

-- ----- 15bis-15quater. Equivalents TTC (migration 20260804160000) -----
-- facture_ttc = 120 + 60 + 0 + 96 - 36 - 96 = 144 (montant_ttc PDF, net avoirs)
SELECT is(
  (SELECT facture_ttc FROM production_month_sums('2031-03', '2031-04') WHERE mois = '2031-03'),
  144::numeric,
  'facture_ttc = 144 (sommes des montant_ttc, nettes des avoirs emis)');
-- en_retard_ttc : F2 (60) seule ; F8 (96) soldee par F9 (-96)
SELECT is(
  (SELECT en_retard_ttc FROM production_month_sums('2031-03', '2031-04') WHERE mois = '2031-03'),
  60::numeric,
  'en_retard_ttc = 60 (solde TTC apres avoirs lies)');
-- encaisse_ttc = paiements bruts : 60 + 30 + 30 (paiement demo exclu)
SELECT is(
  (SELECT encaisse_ttc FROM production_month_sums('2031-03', '2031-04') WHERE mois = '2031-03'),
  120::numeric,
  'encaisse_ttc = 120 (paiements bruts, demo exclu)');

-- ----- 15. Fenetre contrats : seuls 222222 (a cheval) et 333333 (+2 OPCO) -----
SELECT set_eq(
  $$SELECT npec_amount FROM contrats_actifs_fenetre('2031-06-01', '2031-07-01')
    WHERE npec_amount IN (111111, 222222, 333333, 444444, 555555, 666666, 777777)$$,
  ARRAY[222222, 333333]::numeric[],
  'fenetre contrats : termine avant / demarre apres / demo / archives exclus, a cheval et +2 OPCO inclus');

SELECT * FROM finish();
ROLLBACK;

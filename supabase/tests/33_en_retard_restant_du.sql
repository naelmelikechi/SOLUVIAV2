-- ===========================================================================
-- Test : « En retard » = restant du, paiements deduits
-- ===========================================================================
-- Migration : 20260806180000_en_retard_deduit_les_paiements.sql
-- Contexte  : audit #122, constat 13 / chantier C.
--
-- Trois implementations divergeaient sous un seul libelle. La convention
-- retenue (option 1, recommandee par le rapport) est le restant du, avoirs ET
-- paiements deduits.
--
-- Ce test verrouille la RPC sur le chiffrage exact du rapport, pour qu'elle ne
-- puisse plus divergent du calcul TypeScript (soldeRestantDuHt / Ttc de
-- lib/utils/avoir-netting) : une facture de 12 000 HT / 14 400 TTC avec un
-- acompte de 8 000 TTC doit ressortir a 5 333,33 HT et 6 400,00 TTC, et non a
-- 12 000 / 14 400.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

CREATE TEMP TABLE _ctx (
  client_id UUID,
  projet_id UUID,
  facture_id UUID,
  facture2_id UUID
);
INSERT INTO _ctx (client_id, projet_id)
VALUES (gen_random_uuid(), gen_random_uuid());

INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test En Retard SAS', 'ERD', false, false FROM _ctx;

INSERT INTO projets (id, client_id, typologie_id, ref, statut, est_interne, archive)
SELECT projet_id, client_id, (SELECT id FROM typologies_projet LIMIT 1),
       'ERD-TST-0001', 'actif', false, false
FROM _ctx;

-- Facture 1 : 12 000 HT / 14 400 TTC, en retard, acompte de 8 000 TTC.
-- Mois volontairement lointain pour ne croiser aucune donnee existante.
INSERT INTO factures (
  projet_id, client_id, date_emission, date_echeance, mois_concerne,
  montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
  societe_emettrice_id
)
SELECT projet_id, client_id, '2029-01-05', '2029-02-28', '2029-01',
       12000, 20, 2400, 14400, 'en_retard', false,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL')
FROM _ctx;

UPDATE _ctx SET facture_id = (
  SELECT id FROM factures WHERE mois_concerne = '2029-01'
    AND projet_id = (SELECT projet_id FROM _ctx)
  ORDER BY created_at DESC LIMIT 1
);

INSERT INTO paiements (facture_id, montant, date_reception, saisie_manuelle)
SELECT facture_id, 8000, '2029-02-10', true FROM _ctx;

-- ----- Tests sur le mois 2029-01 -------------------------------------------

-- 12 000 - 8 000 x (12 000 / 14 400) = 12 000 - 6 666,67 = 5 333,33
SELECT is(
  (SELECT round(en_retard, 2) FROM public.production_month_sums('2029-01', '2029-02')),
  5333.33::numeric,
  'en_retard HT = restant du, acompte deduit au prorata reel (5 333,33)'
);

-- 14 400 - 8 000 = 6 400,00
SELECT is(
  (SELECT round(en_retard_ttc, 2) FROM public.production_month_sums('2029-01', '2029-02')),
  6400.00::numeric,
  'en_retard TTC = restant du, acompte deduit (6 400,00)'
);

-- Contre-epreuve : le facture brut, lui, reste bien a 12 000.
SELECT is(
  (SELECT round(facture, 2) FROM public.production_month_sums('2029-01', '2029-02')),
  12000.00::numeric,
  'le montant facture brut est inchange (12 000)'
);

-- ----- Avoir partiel cumule avec un paiement -------------------------------
-- Facture 2 : 1 000 HT / 1 200 TTC, avoir de -400 HT / -480 TTC, paiement 240 TTC.
-- Restant du HT = (1000 - 400) - 240 x (1000/1200) = 600 - 200 = 400.
INSERT INTO factures (
  projet_id, client_id, date_emission, date_echeance, mois_concerne,
  montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
  societe_emettrice_id
)
SELECT projet_id, client_id, '2029-03-05', '2029-04-30', '2029-03',
       1000, 20, 200, 1200, 'en_retard', false,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL')
FROM _ctx;

UPDATE _ctx SET facture2_id = (
  SELECT id FROM factures WHERE mois_concerne = '2029-03'
    AND projet_id = (SELECT projet_id FROM _ctx)
  ORDER BY created_at DESC LIMIT 1
);

INSERT INTO factures (
  projet_id, client_id, date_emission, date_echeance, mois_concerne,
  montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
  facture_origine_id, avoir_motif, societe_emettrice_id
)
SELECT projet_id, client_id, '2029-03-20', '2029-04-30', '2029-03',
       -400, 20, -80, -480, 'avoir', true,
       facture2_id, 'Test avoir partiel',
       (SELECT id FROM societes_emettrices WHERE code = 'SOL')
FROM _ctx;

INSERT INTO paiements (facture_id, montant, date_reception, saisie_manuelle)
SELECT facture2_id, 240, '2029-04-15', true FROM _ctx;

SELECT is(
  (SELECT round(en_retard, 2) FROM public.production_month_sums('2029-03', '2029-04')),
  400.00::numeric,
  'avoir ET paiement cumules : 1 000 - 400 - 200 = 400 HT'
);

SELECT is(
  (SELECT round(en_retard_ttc, 2) FROM public.production_month_sums('2029-03', '2029-04')),
  480.00::numeric,
  'avoir ET paiement cumules : 1 200 - 480 - 240 = 480 TTC'
);

-- ----- Bornage a zero ------------------------------------------------------
-- Un paiement superieur au restant du ne doit jamais produire un negatif.
INSERT INTO paiements (facture_id, montant, date_reception, saisie_manuelle)
SELECT facture2_id, 5000, '2029-04-20', true FROM _ctx;

SELECT is(
  (SELECT round(en_retard, 2) FROM public.production_month_sums('2029-03', '2029-04')),
  0.00::numeric,
  'un paiement excedentaire borne le restant du a 0, jamais de negatif'
);

SELECT * FROM finish();
ROLLBACK;

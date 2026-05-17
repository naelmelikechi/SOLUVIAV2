-- ===========================================================================
-- Test : invariants concurrence + cas limites du trigger gapless (sprint 9)
-- ===========================================================================
-- Le test 01_gapless_invoice couvre le path heureux. Celui-ci ajoute :
--
-- 1. Verification statique du LOCK dans le code de la function (la seule
--    protection contre les `MAX(numero_seq)+1` race conditions concurrentes
--    est ce LOCK TABLE; sans tests d isolation pg-niveau, on verifie au
--    moins qu il est bien present dans pg_proc.prosrc).
-- 2. Stress sequentiel sur 30 envois - sequence parfaitement contigue.
-- 3. Envoi dans le desordre - numero_seq suit l ordre d UPDATE, pas l ordre
--    d INSERT du brouillon (defendable d un point de vue legal francais).
-- 4. Rollback transactionnel - savepoint qui rollback le UPDATE ne consomme
--    pas de numero_seq (gapless preserve).
-- 5. Avoir consomme aussi un numero (transition a_emettre -> avoir).
-- 6. Re-update d une facture deja emise ne reattribue pas le numero.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(8);

-- ----- Assertion 1 : LOCK TABLE present dans la function ------------------

SELECT ok(
  (SELECT prosrc FROM pg_proc WHERE proname = 'assign_facture_ref_on_send')
    LIKE '%LOCK TABLE factures IN SHARE ROW EXCLUSIVE MODE%',
  'assign_facture_ref_on_send contient bien le LOCK TABLE serialisant les concurrents'
);

-- ----- Setup commun --------------------------------------------------------

CREATE TEMP TABLE _ctx (
  client_id UUID,
  projet_id UUID,
  max_seq_before INTEGER
);

INSERT INTO _ctx (client_id, projet_id, max_seq_before)
SELECT
  gen_random_uuid(),
  gen_random_uuid(),
  COALESCE((SELECT MAX(numero_seq) FROM factures), 0);

INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Concurrency SAS', 'CON', false, false FROM _ctx;

INSERT INTO projets (id, client_id, typologie_id, ref, statut, est_interne, archive)
SELECT
  c.projet_id, c.client_id,
  (SELECT id FROM typologies_projet LIMIT 1),
  'CON-TST-0001', 'actif', false, false
FROM _ctx c;

CREATE OR REPLACE FUNCTION pg_temp.create_brouillon()
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_contrat_id UUID;
BEGIN
  INSERT INTO factures (
    projet_id, client_id, date_emission, date_echeance, mois_concerne,
    montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir
  )
  SELECT projet_id, client_id, '2026-05-01', '2026-06-30', '2026-05',
         500, 20, 100, 600, 'a_emettre', false
  FROM _ctx
  RETURNING id INTO v_id;

  INSERT INTO contrats (
    id, projet_id, eduvia_id, contract_state, archive,
    contract_number, formation_titre, apprenant_nom, apprenant_prenom
  )
  SELECT
    gen_random_uuid(), projet_id,
    9000000 + (random() * 1000000)::int,
    'En cours', false,
    'CTR-CON-001', 'Formation X', 'Doe', 'Jane'
  FROM _ctx
  RETURNING id INTO v_contrat_id;

  INSERT INTO facture_lignes (facture_id, contrat_id, description, montant_ht)
  VALUES (v_id, v_contrat_id, 'Ligne test', 500);

  RETURN v_id;
END;
$$;

-- ----- Assertion 2 : stress sequentiel (30 envois successifs) -------------

CREATE TEMP TABLE _stress (
  ord INTEGER PRIMARY KEY,
  facture_id UUID
);

DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..30 LOOP
    INSERT INTO _stress (ord, facture_id)
    VALUES (i, pg_temp.create_brouillon());
  END LOOP;
END $$;

UPDATE factures SET statut = 'emise'
WHERE id IN (SELECT facture_id FROM _stress);

SELECT is(
  (SELECT count(*)::int FROM (
     SELECT numero_seq, lag(numero_seq) OVER (ORDER BY numero_seq) AS prev
     FROM factures
     WHERE numero_seq > (SELECT max_seq_before FROM _ctx)
   ) s WHERE s.prev IS NOT NULL AND s.numero_seq <> s.prev + 1),
  0,
  'Stress sequentiel : 30 envois consecutifs - aucun gap dans numero_seq'
);

-- ----- Assertion 3 : envoi dans le desordre ------------------------------

CREATE TEMP TABLE _desordre (
  ord INTEGER PRIMARY KEY,
  facture_id UUID,
  insertion_order INTEGER
);

INSERT INTO _desordre VALUES (1, pg_temp.create_brouillon(), 1);
INSERT INTO _desordre VALUES (2, pg_temp.create_brouillon(), 2);
INSERT INTO _desordre VALUES (3, pg_temp.create_brouillon(), 3);

-- Envoi dans l ordre INVERSE de creation
UPDATE factures SET statut = 'emise'
WHERE id = (SELECT facture_id FROM _desordre WHERE ord = 3);
UPDATE factures SET statut = 'emise'
WHERE id = (SELECT facture_id FROM _desordre WHERE ord = 1);
UPDATE factures SET statut = 'emise'
WHERE id = (SELECT facture_id FROM _desordre WHERE ord = 2);

-- numero_seq doit suivre l ordre d UPDATE (3, 1, 2), pas l ordre INSERT
SELECT cmp_ok(
  (SELECT numero_seq FROM factures
   WHERE id = (SELECT facture_id FROM _desordre WHERE ord = 3)),
  '<',
  (SELECT numero_seq FROM factures
   WHERE id = (SELECT facture_id FROM _desordre WHERE ord = 1)),
  'numero_seq suit l ordre d UPDATE (envoi), pas l ordre d INSERT (creation brouillon)'
);

SELECT cmp_ok(
  (SELECT numero_seq FROM factures
   WHERE id = (SELECT facture_id FROM _desordre WHERE ord = 1)),
  '<',
  (SELECT numero_seq FROM factures
   WHERE id = (SELECT facture_id FROM _desordre WHERE ord = 2)),
  'numero_seq second envoi (ord=1) < troisieme envoi (ord=2)'
);

-- ----- Assertion 4 : rollback ne consomme pas de numero_seq --------------

-- SAVEPOINT + ROLLBACK TO SAVEPOINT ne sont pas autorises dans un bloc
-- DO/PL/pgSQL (la sous-transaction PL/pgSQL utilise BEGIN/EXCEPTION).
-- Comme ce script tourne dans une transaction explicite (cf. BEGIN; ligne 18),
-- on execute au top niveau via une temp table pour passer l UUID.
CREATE TEMP TABLE _rollback_test (facture_id UUID);
INSERT INTO _rollback_test SELECT pg_temp.create_brouillon();

SAVEPOINT before_send;
UPDATE factures SET statut = 'emise'
  WHERE id = (SELECT facture_id FROM _rollback_test);
ROLLBACK TO SAVEPOINT before_send;
-- La facture reste en 'a_emettre', sans ref ni numero_seq

CREATE TEMP TABLE _next_after_rollback (facture_id UUID);
INSERT INTO _next_after_rollback (facture_id)
SELECT pg_temp.create_brouillon();

UPDATE factures SET statut = 'emise'
WHERE id = (SELECT facture_id FROM _next_after_rollback);

-- Le numero attribue doit etre max_seq_before + 30 + 3 + 1 = +34
-- (30 stress + 3 desordre + 1 nouveau, le rollback n a rien consomme)
SELECT is(
  (SELECT numero_seq FROM factures
   WHERE id = (SELECT facture_id FROM _next_after_rollback)),
  (SELECT max_seq_before FROM _ctx) + 34,
  'Rollback transactionnel ne consomme pas de numero_seq (gapless preserve)'
);

-- ----- Assertion 5 : avoir consomme aussi un numero ----------------------
--
-- Le constraint chk_avoir_motif exige (est_avoir=true) =>
-- (avoir_motif IS NOT NULL AND facture_origine_id IS NOT NULL).
-- On cree donc d abord une facture origine emise, puis un avoir qui la
-- reference.

-- Facture origine (emise) qui servira de cible a l avoir
CREATE TEMP TABLE _avoir_origine (facture_id UUID);
INSERT INTO _avoir_origine SELECT pg_temp.create_brouillon();
UPDATE factures SET statut = 'emise'
WHERE id = (SELECT facture_id FROM _avoir_origine);

-- Brouillon qui deviendra l avoir
CREATE TEMP TABLE _avoir (facture_id UUID);
INSERT INTO _avoir SELECT pg_temp.create_brouillon();

-- Avoir: la contrainte factures_signe_montants_check exige des montants
-- negatifs pour est_avoir=true (legal FR, montants signes coherents).
UPDATE factures SET
  statut = 'avoir',
  est_avoir = true,
  montant_ht = -montant_ht,
  montant_tva = -montant_tva,
  montant_ttc = -montant_ttc,
  avoir_motif = 'Test gapless avoir',
  facture_origine_id = (SELECT facture_id FROM _avoir_origine)
WHERE id = (SELECT facture_id FROM _avoir);

SELECT isnt(
  (SELECT numero_seq FROM factures
   WHERE id = (SELECT facture_id FROM _avoir)),
  NULL,
  'Transition a_emettre -> avoir attribue aussi un numero_seq'
);

SELECT matches(
  (SELECT ref FROM factures
   WHERE id = (SELECT facture_id FROM _avoir)),
  '^AVR-CON-\d{4}$',
  'Avoir recoit un ref de la forme AVR-XXX-NNNN (serie distincte des factures)'
);

-- ----- Assertion 6 : re-update facture deja emise n attribue pas un nouveau numero --

CREATE TEMP TABLE _reupd (facture_id UUID, seq_initial INTEGER);
INSERT INTO _reupd (facture_id) SELECT pg_temp.create_brouillon();

UPDATE factures SET statut = 'emise'
WHERE id = (SELECT facture_id FROM _reupd);

UPDATE _reupd SET seq_initial = (
  SELECT numero_seq FROM factures WHERE id = _reupd.facture_id
);

-- Re-update du statut : par exemple on flag comme 'payee' (transition
-- emise -> payee). Le trigger NE doit PAS reattribuer un numero.
UPDATE factures SET statut = 'payee'
WHERE id = (SELECT facture_id FROM _reupd);

SELECT is(
  (SELECT numero_seq FROM factures
   WHERE id = (SELECT facture_id FROM _reupd)),
  (SELECT seq_initial FROM _reupd),
  'Re-update d une facture deja emise (emise -> payee) ne reassigne pas numero_seq'
);

SELECT * FROM finish();
ROLLBACK;

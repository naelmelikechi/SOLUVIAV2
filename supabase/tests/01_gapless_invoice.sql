-- ===========================================================================
-- Test : gapless invoice numbering (sprint 6)
-- ===========================================================================
-- Invariant : la sequence numero_seq est strictement contigue. Trigger
-- assign_facture_ref_on_send (migration 20260506160500) attribue ref +
-- numero_seq au passage 'a_emettre' -> emise/avoir, sous LOCK SHARE ROW
-- EXCLUSIVE pour serialiser les concurrents.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(7);

-- ----- Setup ---------------------------------------------------------------
-- Note : on travaille dans BEGIN ... ROLLBACK donc tout est nettoye en sortie.
-- max_seq_before capture le max courant (necessaire car la DB peut deja avoir
-- des factures en seed, comme la facture demo SOLUVIA).

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
SELECT client_id, 'Test Gapless SAS', 'GAP', false, false FROM _ctx;

INSERT INTO projets (id, client_id, typologie_id, ref, statut, est_interne, archive)
SELECT
  c.projet_id, c.client_id,
  (SELECT id FROM typologies_projet LIMIT 1),
  'GAP-TST-0001', 'actif', false, false
FROM _ctx c;

-- Helper : insere brouillon + ligne, renvoie l UUID
CREATE OR REPLACE FUNCTION pg_temp.create_brouillon_with_ligne()
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
         1000, 20, 200, 1200, 'a_emettre', false
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
    'CTR-GAP-001', 'Formation X', 'Doe', 'Jane'
  FROM _ctx
  RETURNING id INTO v_contrat_id;

  INSERT INTO facture_lignes (facture_id, contrat_id, description, montant_ht)
  VALUES (v_id, v_contrat_id, 'Ligne test', 1000);

  RETURN v_id;
END;
$$;

-- Stocke les ids des factures crees pour assertions ulterieures
CREATE TEMP TABLE _factures_test (
  ord INTEGER PRIMARY KEY,
  facture_id UUID
);

-- ----- Phase 1 : insert brouillon -> ref + seq NULL ------------------------
INSERT INTO _factures_test VALUES (1, pg_temp.create_brouillon_with_ligne());

SELECT is(
  (SELECT ref FROM factures WHERE id = (SELECT facture_id FROM _factures_test WHERE ord=1)),
  NULL,
  'Brouillon : ref est NULL avant envoi'
);
SELECT is(
  (SELECT numero_seq FROM factures WHERE id = (SELECT facture_id FROM _factures_test WHERE ord=1)),
  NULL,
  'Brouillon : numero_seq est NULL avant envoi'
);

-- ----- Phase 2 : transition a_emettre -> emise attribue ref + seq -----------
UPDATE factures SET statut = 'emise'
WHERE id = (SELECT facture_id FROM _factures_test WHERE ord=1);

SELECT matches(
  (SELECT ref FROM factures WHERE id = (SELECT facture_id FROM _factures_test WHERE ord=1)),
  '^FAC-GAP-\d{4}$',
  'ref attribue au format FAC-GAP-XXXX apres envoi'
);
SELECT is(
  (SELECT numero_seq FROM factures WHERE id = (SELECT facture_id FROM _factures_test WHERE ord=1)),
  (SELECT max_seq_before + 1 FROM _ctx),
  'numero_seq = max_seq_before + 1'
);

-- ----- Phase 3 : 3 envois successifs -> sequence contigue ------------------
INSERT INTO _factures_test VALUES (2, pg_temp.create_brouillon_with_ligne());
INSERT INTO _factures_test VALUES (3, pg_temp.create_brouillon_with_ligne());
INSERT INTO _factures_test VALUES (4, pg_temp.create_brouillon_with_ligne());

UPDATE factures SET statut = 'emise' WHERE id IN (
  SELECT facture_id FROM _factures_test WHERE ord IN (2,3,4)
);

SELECT is(
  (SELECT array_agg(numero_seq ORDER BY ord)
   FROM factures f JOIN _factures_test t ON t.facture_id = f.id
   WHERE t.ord IN (2,3,4)),
  ARRAY[
    (SELECT max_seq_before + 2 FROM _ctx),
    (SELECT max_seq_before + 3 FROM _ctx),
    (SELECT max_seq_before + 4 FROM _ctx)
  ],
  'Sequence contigue sur 3 envois successifs (max+2, max+3, max+4)'
);

-- ----- Phase 4 : delete brouillon ne consomme pas de numero_seq ------------
DO $$
DECLARE
  v_drop UUID;
BEGIN
  v_drop := pg_temp.create_brouillon_with_ligne();
  -- Un brouillon peut etre supprime (statut=a_emettre, RLS le permet)
  DELETE FROM factures WHERE id = v_drop;
END $$;

INSERT INTO _factures_test VALUES (5, pg_temp.create_brouillon_with_ligne());
UPDATE factures SET statut = 'emise'
WHERE id = (SELECT facture_id FROM _factures_test WHERE ord=5);

SELECT is(
  (SELECT numero_seq FROM factures
   WHERE id = (SELECT facture_id FROM _factures_test WHERE ord=5)),
  (SELECT max_seq_before + 5 FROM _ctx),
  'Apres suppression d un brouillon, prochain envoi = max+5 (gapless preserve)'
);

-- ----- Phase 5 : verifie que la sequence n a aucun trou --------------------
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT numero_seq, lag(numero_seq) OVER (ORDER BY numero_seq) AS prev
     FROM factures
     WHERE numero_seq > (SELECT max_seq_before FROM _ctx)
   ) s WHERE s.prev IS NOT NULL AND s.numero_seq <> s.prev + 1),
  0,
  'Aucun trou dans la sequence numero_seq pour les factures du test'
);

SELECT * FROM finish();
ROLLBACK;

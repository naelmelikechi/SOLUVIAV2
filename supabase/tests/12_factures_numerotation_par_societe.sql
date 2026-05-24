-- Phase 4 : tests numerotation factures par societe emettrice.
-- Verifie :
--   1. SOLUVIA (legacy_ref_format=TRUE) emet en FAC-<TRIGRAMME>-NNNN.
--   2. Une nouvelle societe (legacy_ref_format=FALSE) emet en FAC-<CODE>-<TRIGRAMME>-NNNN.
--   3. Les sequences sont independantes par societe (DIGIVIA demarre a 1 meme si SOL est a N).
--   4. Index unique sur (societe_emettrice_id, numero_seq) WHERE !est_avoir / est_avoir.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(7);

-- Fixture : un client + une societe DIG (legacy_ref_format=FALSE) + une facture SOL + une DIG
DO $$
DECLARE
  v_client_id UUID;
  v_sol_id UUID;
  v_dig_id UUID;
BEGIN
  SELECT id INTO v_sol_id FROM societes_emettrices WHERE code = 'SOL';

  INSERT INTO societes_emettrices (
    code, raison_sociale, siret, tva_intracom, adresse, code_postal, ville,
    email_contact, est_defaut, actif, legacy_ref_format
  ) VALUES (
    'DIG', 'DIGIVIA SAS', '999999999', 'FR999999999',
    '1 rue test', '79000', 'Niort', 'contact@digivia.fr',
    FALSE, TRUE, FALSE
  ) RETURNING id INTO v_dig_id;

  INSERT INTO clients (trigramme, raison_sociale)
  VALUES ('NUM', 'Client Test Numerotation')
  RETURNING id INTO v_client_id;

  -- Facture SOL (legacy format) - emise pour declencher la numerotation
  INSERT INTO factures (
    societe_emettrice_id, client_id, statut, est_avoir,
    montant_ht, montant_tva, montant_ttc, taux_tva,
    date_emission, date_echeance
  ) VALUES (
    v_sol_id, v_client_id, 'emise', FALSE,
    100, 20, 120, 20,
    CURRENT_DATE, CURRENT_DATE + 30
  );

  -- Facture DIG (multi-societe format)
  INSERT INTO factures (
    societe_emettrice_id, client_id, statut, est_avoir,
    montant_ht, montant_tva, montant_ttc, taux_tva,
    date_emission, date_echeance
  ) VALUES (
    v_dig_id, v_client_id, 'emise', FALSE,
    200, 40, 240, 20,
    CURRENT_DATE, CURRENT_DATE + 30
  );

  -- Deuxieme facture DIG (verifie sequence dediee)
  INSERT INTO factures (
    societe_emettrice_id, client_id, statut, est_avoir,
    montant_ht, montant_tva, montant_ttc, taux_tva,
    date_emission, date_echeance
  ) VALUES (
    v_dig_id, v_client_id, 'emise', FALSE,
    300, 60, 360, 20,
    CURRENT_DATE, CURRENT_DATE + 30
  );
END $$;

-- 1. SOL utilise le format legacy FAC-<TRIGRAMME>-NNNN
SELECT ok(
  (SELECT ref FROM factures f
     JOIN societes_emettrices s ON s.id = f.societe_emettrice_id
     JOIN clients c ON c.id = f.client_id
    WHERE s.code = 'SOL' AND c.trigramme = 'NUM' LIMIT 1) LIKE 'FAC-NUM-%',
  'SOL emet en format legacy FAC-<TRIGRAMME>-NNNN'
);

-- 2. DIG utilise le nouveau format FAC-<CODE>-<TRIGRAMME>-NNNN
SELECT ok(
  (SELECT ref FROM factures f
     JOIN societes_emettrices s ON s.id = f.societe_emettrice_id
    WHERE s.code = 'DIG' ORDER BY numero_seq LIMIT 1) LIKE 'FAC-DIG-NUM-%',
  'DIG emet en nouveau format FAC-<CODE>-<TRIGRAMME>-NNNN'
);

-- 3. Premiere facture DIG = numero_seq 1 (sequence dediee)
SELECT is(
  (SELECT numero_seq FROM factures f
     JOIN societes_emettrices s ON s.id = f.societe_emettrice_id
    WHERE s.code = 'DIG' ORDER BY numero_seq LIMIT 1),
  1,
  'DIG demarre a numero_seq=1 meme si SOL est a N'
);

-- 4. Deuxieme facture DIG = numero_seq 2
SELECT is(
  (SELECT numero_seq FROM factures f
     JOIN societes_emettrices s ON s.id = f.societe_emettrice_id
    WHERE s.code = 'DIG' ORDER BY numero_seq DESC LIMIT 1),
  2,
  'Sequence DIG incremente correctement (1 puis 2)'
);

-- 5. SOL et DIG ont des numero_seq independants (peuvent avoir le meme numero)
SELECT ok(
  EXISTS (
    SELECT 1 FROM factures f
      JOIN societes_emettrices s ON s.id = f.societe_emettrice_id
     WHERE s.code = 'DIG' AND f.numero_seq = 1
  ),
  'DIG peut avoir numero_seq=1 independamment de SOL'
);

-- 6. Index unique sur (societe_emettrice_id, numero_seq) factures (NOT avoir)
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE indexname = 'uq_factures_numero_seq_facture'),
  1,
  'Index unique numero_seq par societe pour factures present'
);

-- 7. Index unique sur (societe_emettrice_id, numero_seq) avoirs
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE indexname = 'uq_factures_numero_seq_avoir'),
  1,
  'Index unique numero_seq par societe pour avoirs present'
);

SELECT * FROM finish();
ROLLBACK;

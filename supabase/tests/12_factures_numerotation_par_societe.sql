-- Numerotation factures : serie UNIQUE a prefixe fixe FAC-SOL (conformite FR).
--
-- Depuis 20260610130000_factures_ref_serie_unique, la numerotation n'est PLUS
-- par societe emettrice : TOUTES les factures partagent une seule serie gapless
-- FAC-SOL-NNNN, quelle que soit la societe emettrice (SOLUVIA emet ses propres
-- factures, pas en mandataire -> une seule serie continue, art. 242 nonies A).
--
-- Le format mono-serie + le gapless sont couverts par 01_gapless_invoice.
-- Ici on verifie l'invariant SPECIFIQUE : deux societes emettrices distinctes
-- partagent le MEME compteur (pas de serie dediee par societe).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(5);

-- Capture le max courant (la DB peut deja avoir des factures en seed).
CREATE TEMP TABLE _ctx (max_seq_before INTEGER);
INSERT INTO _ctx
SELECT COALESCE((SELECT MAX(numero_seq) FROM factures WHERE est_avoir = false), 0);

-- Fixture : 1 facture SOL puis 2 factures DIG (societe distincte), emises.
CREATE TEMP TABLE _fx (label TEXT, facture_id UUID);

DO $$
DECLARE
  v_client UUID := gen_random_uuid();
  v_sol UUID;
  v_dig UUID;
  v_f UUID;
  v_projet UUID;
BEGIN
  SELECT id INTO v_sol FROM societes_emettrices WHERE code = 'SOL';

  INSERT INTO societes_emettrices (
    code, raison_sociale, siret, tva_intracom, adresse, code_postal, ville,
    email_contact, est_defaut, actif
  ) VALUES (
    'DIG', 'DIGIVIA SAS', '99999999900099', 'FR99999999999',
    '1 rue test', '79000', 'Niort', 'contact@digivia.fr', FALSE, TRUE
  ) RETURNING id INTO v_dig;

  INSERT INTO clients (id, trigramme, raison_sociale, is_demo, archive)
  VALUES (v_client, 'NUM', 'Client Test Numerotation', false, false);

  INSERT INTO projets (id, client_id, typologie_id, ref, statut, est_interne, archive)
  VALUES (gen_random_uuid(), v_client, (SELECT id FROM typologies_projet LIMIT 1), 'NUM-PROJ', 'actif', false, false)
  RETURNING id INTO v_projet;

  INSERT INTO factures (
    projet_id, societe_emettrice_id, client_id, statut, est_avoir,
    montant_ht, montant_tva, montant_ttc, taux_tva, date_emission, date_echeance
  ) VALUES (
    v_projet, v_sol, v_client, 'emise', FALSE, 100, 20, 120, 20, CURRENT_DATE, CURRENT_DATE + 30
  ) RETURNING id INTO v_f;
  INSERT INTO _fx VALUES ('sol1', v_f);

  INSERT INTO factures (
    projet_id, societe_emettrice_id, client_id, statut, est_avoir,
    montant_ht, montant_tva, montant_ttc, taux_tva, date_emission, date_echeance
  ) VALUES (
    v_projet, v_dig, v_client, 'emise', FALSE, 200, 40, 240, 20, CURRENT_DATE, CURRENT_DATE + 30
  ) RETURNING id INTO v_f;
  INSERT INTO _fx VALUES ('dig1', v_f);

  INSERT INTO factures (
    projet_id, societe_emettrice_id, client_id, statut, est_avoir,
    montant_ht, montant_tva, montant_ttc, taux_tva, date_emission, date_echeance
  ) VALUES (
    v_projet, v_dig, v_client, 'emise', FALSE, 300, 60, 360, 20, CURRENT_DATE, CURRENT_DATE + 30
  ) RETURNING id INTO v_f;
  INSERT INTO _fx VALUES ('dig2', v_f);
END $$;

-- 1. La facture SOL est numerotee en serie unique FAC-SOL-NNNN.
SELECT matches(
  (SELECT ref FROM factures WHERE id = (SELECT facture_id FROM _fx WHERE label = 'sol1')),
  '^FAC-SOL-\d{4}$',
  'Facture SOL : ref FAC-SOL-NNNN (serie unique)'
);

-- 2. La facture DIG porte le MEME prefixe FAC-SOL (pas FAC-DIG) : serie partagee.
SELECT matches(
  (SELECT ref FROM factures WHERE id = (SELECT facture_id FROM _fx WHERE label = 'dig1')),
  '^FAC-SOL-\d{4}$',
  'Facture DIG : meme prefixe FAC-SOL (numerotation non par societe)'
);

-- 3. Les 3 factures (SOL, DIG, DIG) se suivent sur UN compteur partage.
SELECT is(
  (SELECT array_agg(f.numero_seq ORDER BY f.numero_seq)
   FROM factures f JOIN _fx x ON x.facture_id = f.id),
  ARRAY[
    (SELECT max_seq_before + 1 FROM _ctx),
    (SELECT max_seq_before + 2 FROM _ctx),
    (SELECT max_seq_before + 3 FROM _ctx)
  ],
  'numero_seq contigu et partage entre societes (max+1, max+2, max+3)'
);

-- 4. Index unique numero_seq (factures) present.
SELECT is(
  (SELECT count(*)::int FROM pg_indexes WHERE indexname = 'uq_factures_numero_seq_facture'),
  1,
  'Index unique uq_factures_numero_seq_facture present'
);

-- 5. Index unique numero_seq (avoirs) present.
SELECT is(
  (SELECT count(*)::int FROM pg_indexes WHERE indexname = 'uq_factures_numero_seq_avoir'),
  1,
  'Index unique uq_factures_numero_seq_avoir present'
);

SELECT * FROM finish();
ROLLBACK;

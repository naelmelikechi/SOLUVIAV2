-- Numerotation factures : serie UNIQUE a prefixe fixe FAC-SOL (conformite FR).
--
-- Depuis 20260610130000_factures_ref_serie_unique, la numerotation n'est PLUS
-- par societe emettrice : les factures SOLUVIA partagent une seule serie
-- gapless FAC-SOL-NNNN (SOLUVIA emet ses propres factures, pas en mandataire
-- -> une seule serie continue, art. 242 nonies A).
--
-- Depuis 20260723120000_factures_guards_serie_et_delete, cette serie est
-- RESERVEE a la societe legacy (SOL) : emettre une facture portee par une
-- autre societe emettrice est refuse tant que la numerotation par societe
-- n'est pas implementee (sinon une facture DIGIVIA sortirait en FAC-SOL-NNNN
-- sur la serie legale de SOLUVIA). Cf. runbook DIGIVIA.
--
-- Le format mono-serie + le gapless sont couverts par 01_gapless_invoice.
-- Ici : la garde multi-societe + la continuite du compteur apres un refus.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(5);

-- Capture le max courant (la DB peut deja avoir des factures en seed).
CREATE TEMP TABLE _ctx (max_seq_before INTEGER);
INSERT INTO _ctx
SELECT COALESCE((SELECT MAX(numero_seq) FROM factures WHERE est_avoir = false), 0);

-- Fixture : societes SOL (existante) + DIG (non legacy), client, projet,
-- une facture SOL emise.
CREATE TEMP TABLE _fx (label TEXT, id UUID);

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

  INSERT INTO _fx VALUES ('societe_dig', v_dig);
  INSERT INTO _fx VALUES ('projet', v_projet);
  INSERT INTO _fx VALUES ('client', v_client);

  INSERT INTO factures (
    projet_id, societe_emettrice_id, client_id, statut, est_avoir,
    montant_ht, montant_tva, montant_ttc, taux_tva, date_emission, date_echeance
  ) VALUES (
    v_projet, v_sol, v_client, 'emise', FALSE, 100, 20, 120, 20, CURRENT_DATE, CURRENT_DATE + 30
  ) RETURNING id INTO v_f;
  INSERT INTO _fx VALUES ('sol1', v_f);
END $$;

-- 1. La facture SOL est numerotee en serie unique FAC-SOL-NNNN.
SELECT matches(
  (SELECT ref FROM factures WHERE id = (SELECT id FROM _fx WHERE label = 'sol1')),
  '^FAC-SOL-\d{4}$',
  'Facture SOL : ref FAC-SOL-NNNN (serie unique)'
);

-- 2. Emettre une facture portee par DIG (non legacy) est refuse.
SELECT throws_like(
  $$ INSERT INTO factures (
       projet_id, societe_emettrice_id, client_id, statut, est_avoir,
       montant_ht, montant_tva, montant_ttc, taux_tva, date_emission, date_echeance
     ) VALUES (
       (SELECT id FROM _fx WHERE label = 'projet'),
       (SELECT id FROM _fx WHERE label = 'societe_dig'),
       (SELECT id FROM _fx WHERE label = 'client'),
       'emise', FALSE, 200, 40, 240, 20, CURRENT_DATE, CURRENT_DATE + 30
     ) $$,
  'Numerotation non configuree%',
  'Emission DIG refusee : serie FAC-SOL reservee a la societe legacy'
);

-- 3. Le compteur reste contigu apres le refus : une 2e facture SOL prend max+2.
DO $$
DECLARE
  v_f UUID;
BEGIN
  INSERT INTO factures (
    projet_id, societe_emettrice_id, client_id, statut, est_avoir,
    montant_ht, montant_tva, montant_ttc, taux_tva, date_emission, date_echeance
  ) VALUES (
    (SELECT id FROM _fx WHERE label = 'projet'),
    (SELECT id FROM societes_emettrices WHERE code = 'SOL'),
    (SELECT id FROM _fx WHERE label = 'client'),
    'emise', FALSE, 300, 60, 360, 20, CURRENT_DATE, CURRENT_DATE + 30
  ) RETURNING id INTO v_f;
  INSERT INTO _fx VALUES ('sol2', v_f);
END $$;

SELECT is(
  (SELECT array_agg(f.numero_seq ORDER BY f.numero_seq)
   FROM factures f JOIN _fx x ON x.id = f.id AND x.label IN ('sol1', 'sol2')),
  ARRAY[
    (SELECT max_seq_before + 1 FROM _ctx),
    (SELECT max_seq_before + 2 FROM _ctx)
  ],
  'numero_seq contigu apres un refus DIG (max+1, max+2 : pas de numero consomme)'
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

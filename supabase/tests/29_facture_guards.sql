-- ===========================================================================
-- Test : gardes DB facturation (audit 2026-07-23)
-- ===========================================================================
-- Migration 20260723120000 :
--   1. Trigger BEFORE DELETE : une facture emise (ref attribue) n'est jamais
--      supprimable, meme via service_role (bypass RLS). Brouillon supprimable.
--   2. Garde multi-societe : l'attribution d'un numero sur la serie unique
--      FAC-SOL est refusee pour toute societe non legacy_ref_format.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(4);

-- ----- Setup ---------------------------------------------------------------
CREATE TEMP TABLE _ctx (
  client_id UUID,
  projet_id UUID,
  societe_dig UUID
);

INSERT INTO _ctx (client_id, projet_id)
SELECT gen_random_uuid(), gen_random_uuid();

INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Guards SAS', 'GRD', false, false FROM _ctx;

INSERT INTO projets (id, client_id, typologie_id, ref, statut, est_interne, archive)
SELECT
  c.projet_id, c.client_id,
  (SELECT id FROM typologies_projet LIMIT 1),
  'GRD-TST-0001', 'actif', false, false
FROM _ctx c;

-- Societe emettrice non-legacy (simule DIGIVIA avant migration numerotation)
INSERT INTO societes_emettrices (
  code, raison_sociale, siret, tva_intracom, adresse, code_postal, ville,
  email_contact, legacy_ref_format, est_defaut, actif
)
VALUES (
  'DIG', 'Test DIGIVIA SAS', '00000000000000', 'FR00000000000', '1 rue Test',
  '75001', 'Paris', 'test@example.com', FALSE, FALSE, TRUE
);

UPDATE _ctx SET societe_dig = (SELECT id FROM societes_emettrices WHERE code = 'DIG');

-- Helper : insere un brouillon rattache a une societe donnee, renvoie l'UUID
CREATE OR REPLACE FUNCTION pg_temp.create_brouillon(p_societe UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO factures (
    projet_id, client_id, date_emission, date_echeance, mois_concerne,
    montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
    societe_emettrice_id
  )
  SELECT projet_id, client_id, '2026-07-01', '2026-08-31', '2026-07',
         1000, 20, 200, 1200, 'a_emettre', false, p_societe
  FROM _ctx
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE TEMP TABLE _f (
  ord INTEGER PRIMARY KEY,
  facture_id UUID
);

-- ----- 1. Brouillon : DELETE reste possible --------------------------------
INSERT INTO _f VALUES (1, pg_temp.create_brouillon(
  (SELECT id FROM societes_emettrices WHERE code = 'SOL')));

SELECT lives_ok(
  $$ DELETE FROM factures WHERE id = (SELECT facture_id FROM _f WHERE ord = 1) $$,
  'Un brouillon (ref NULL) reste supprimable'
);

-- ----- 2. Facture emise : DELETE interdit ----------------------------------
INSERT INTO _f VALUES (2, pg_temp.create_brouillon(
  (SELECT id FROM societes_emettrices WHERE code = 'SOL')));

UPDATE factures SET statut = 'emise'
WHERE id = (SELECT facture_id FROM _f WHERE ord = 2);

SELECT matches(
  (SELECT ref FROM factures WHERE id = (SELECT facture_id FROM _f WHERE ord = 2)),
  '^FAC-SOL-\d{4}$',
  'Emission SOL : la ref FAC-SOL-XXXX est toujours attribuee (garde sans regression)'
);

SELECT throws_like(
  $$ DELETE FROM factures WHERE id = (SELECT facture_id FROM _f WHERE ord = 2) $$,
  'Suppression interdite%',
  'Une facture emise ne peut pas etre supprimee (gapless, meme via service_role)'
);

-- ----- 3. Emission pour une societe non-legacy : refusee -------------------
INSERT INTO _f VALUES (3, pg_temp.create_brouillon(
  (SELECT societe_dig FROM _ctx)));

SELECT throws_like(
  $$ UPDATE factures SET statut = 'emise'
     WHERE id = (SELECT facture_id FROM _f WHERE ord = 3) $$,
  'Numerotation non configuree%',
  'Emission refusee pour une societe emettrice non legacy (serie FAC-SOL reservee a SOLUVIA)'
);

SELECT * FROM finish();
ROLLBACK;

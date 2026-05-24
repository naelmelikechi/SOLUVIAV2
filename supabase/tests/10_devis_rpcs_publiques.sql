-- Test : RPCs publiques get/accept/refuse devis
-- Cree un devis envoye en fixture, teste les 3 RPCs.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(8);

-- Fixture : un client + un devis envoye (avec token UUID)
DO $$
DECLARE
  v_client_id UUID;
  v_societe_id UUID;
  v_devis_id UUID;
BEGIN
  SELECT id INTO v_societe_id FROM societes_emettrices WHERE code = 'SOL';

  INSERT INTO clients (trigramme, raison_sociale)
  VALUES ('TST', 'Test Client')
  RETURNING id INTO v_client_id;

  INSERT INTO devis (societe_emettrice_id, client_id, objet, date_validite)
  VALUES (v_societe_id, v_client_id, 'Test devis', CURRENT_DATE + 90)
  RETURNING id INTO v_devis_id;

  -- Ajout d une ligne
  INSERT INTO devis_lignes (devis_id, ordre, libelle, quantite, prix_unitaire_ht, taux_tva, total_ht, total_tva, total_ttc)
  VALUES (v_devis_id, 1, 'Prestation test', 1, 1000, 20, 1000, 200, 1200);

  -- Bascule en envoye (triggers : ref + token alloues)
  UPDATE devis SET statut = 'envoye' WHERE id = v_devis_id;
END $$;

-- 1. Devis a recu une ref DEV-SOL-NNNN
SELECT ok(
  (SELECT ref FROM devis WHERE objet = 'Test devis') LIKE 'DEV-SOL-%',
  'devis envoye a une ref DEV-SOL-NNNN'
);

-- 2. Devis a un acceptation_token
SELECT isnt(
  (SELECT acceptation_token FROM devis WHERE objet = 'Test devis'),
  NULL,
  'devis envoye a un acceptation_token'
);

-- 3. Devis a une date_envoi
SELECT isnt(
  (SELECT date_envoi FROM devis WHERE objet = 'Test devis'),
  NULL,
  'devis envoye a une date_envoi'
);

-- 4. get_devis_public avec token valide retourne JSON
SELECT ok(
  (SELECT (get_devis_public((SELECT acceptation_token FROM devis WHERE objet = 'Test devis')))::TEXT LIKE '%"ref"%'),
  'get_devis_public retourne un objet contenant ref'
);

-- 5. get_devis_public avec token invalide leve une exception
SELECT throws_ok(
  $$ SELECT get_devis_public('00000000-0000-0000-0000-000000000000') $$,
  'P0002',
  NULL,
  'get_devis_public sur token invalide leve P0002'
);

-- 6. accept_devis_public avec email invalide leve P0001
SELECT throws_ok(
  format($$ SELECT accept_devis_public(%L, 'Jean Dupont', 'invalide') $$,
    (SELECT acceptation_token FROM devis WHERE objet = 'Test devis')),
  'P0001',
  NULL,
  'accept_devis_public refuse un email invalide'
);

-- 7. accept_devis_public avec donnees valides bascule en accepte
DO $$
DECLARE v_token TEXT;
BEGIN
  SELECT acceptation_token INTO v_token FROM devis WHERE objet = 'Test devis';
  PERFORM accept_devis_public(v_token, 'Jean Dupont', 'jean@example.com');
END $$;

SELECT is(
  (SELECT statut::TEXT FROM devis WHERE objet = 'Test devis'),
  'accepte',
  'devis passe en accepte apres accept_devis_public'
);

-- 8. accept_devis_public sur devis deja accepte leve P0001
SELECT throws_ok(
  format($$ SELECT accept_devis_public(%L, 'X', 'x@y.fr') $$,
    (SELECT acceptation_token FROM devis WHERE objet = 'Test devis')),
  'P0001',
  NULL,
  'accept_devis_public refuse un devis non envoye'
);

SELECT * FROM finish();
ROLLBACK;

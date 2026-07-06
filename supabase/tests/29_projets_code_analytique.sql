-- ===========================================================================
-- Test : convention analytique "ref seule" (code_analytique = projets.ref)
-- ===========================================================================
-- Migration : 20260706100000_projets_code_analytique_ref.sql
-- Trigger zzz_projets_code_analytique (BEFORE INSERT, apres trg_projet_ref
-- par ordre alphabetique) : pose code_analytique = ref si NULL, jamais
-- d'ecrasement d'un code fourni explicitement. Backfill : tous les projets
-- (archives compris) + bascule de l'ancien code '11.01.CTR.COM'.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(8);

-- Fixtures : un client + une typologie dediee (le seed demo est absent en CI,
-- les tests pgTAP creent leurs propres fixtures ; rollback en fin de fichier).
CREATE TEMP TABLE _ctx (client_id UUID, typo_app UUID);
INSERT INTO _ctx (client_id, typo_app) VALUES (gen_random_uuid(), gen_random_uuid());

INSERT INTO typologies_projet (id, code, libelle, actif)
SELECT typo_app, 'TST', 'Typologie test analytique', true FROM _ctx;

INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Code Analytique', 'TCA', false, false FROM _ctx;

SELECT isnt((SELECT typo_app FROM _ctx), NULL, 'Fixture : typologie de test presente');

CREATE TEMP TABLE _p (id1 UUID, id2 UUID, id3 UUID);
INSERT INTO _p DEFAULT VALUES;

-- 1. Creation d'un projet normal (code_analytique non fourni) :
--    la ref est generee par trg_projet_ref PUIS le trigger zzz pose le code.
WITH ins AS (
  INSERT INTO projets (client_id, typologie_id, statut, archive, taux_commission)
  SELECT client_id, typo_app, 'actif', false, 0 FROM _ctx
  RETURNING id
)
UPDATE _p SET id1 = (SELECT id FROM ins);

SELECT matches(
  (SELECT ref FROM projets WHERE id = (SELECT id1 FROM _p)),
  '^[0-9]{4}-TCA-TST$',
  'ref auto-generee NNNN-TCA-TST (trigger trg_projet_ref inchange)');

SELECT isnt(
  (SELECT code_analytique FROM projets WHERE id = (SELECT id1 FROM _p)),
  NULL,
  'Projet normal : code_analytique non NULL (NEW.ref etait bien rempli)');

SELECT is(
  (SELECT code_analytique FROM projets WHERE id = (SELECT id1 FROM _p)),
  (SELECT ref FROM projets WHERE id = (SELECT id1 FROM _p)),
  'Projet normal : code_analytique = ref a la creation (ordre des triggers OK)');

-- 2. Creation avec code fourni explicitement : non ecrase par le trigger.
WITH ins AS (
  INSERT INTO projets (client_id, typologie_id, statut, archive, taux_commission, code_analytique)
  SELECT client_id, typo_app, 'actif', false, 0, 'CODE-EXPLICITE' FROM _ctx
  RETURNING id
)
UPDATE _p SET id2 = (SELECT id FROM ins);

SELECT is(
  (SELECT code_analytique FROM projets WHERE id = (SELECT id2 FROM _p)),
  'CODE-EXPLICITE',
  'Code fourni explicitement a l''insert : non ecrase par le trigger');

-- 3. Backfill (rejoue la logique de la migration sur une fixture) : un projet
--    historique avec code NULL (trigger BEFORE INSERT contourne via UPDATE
--    post-insert, archive = true pour verifier que les archives sont couverts).
WITH ins AS (
  INSERT INTO projets (client_id, typologie_id, statut, archive, taux_commission)
  SELECT client_id, typo_app, 'actif', true, 0 FROM _ctx
  RETURNING id
)
UPDATE _p SET id3 = (SELECT id FROM ins);

UPDATE projets SET code_analytique = NULL WHERE id = (SELECT id3 FROM _p);

UPDATE projets SET code_analytique = ref WHERE code_analytique IS NULL;

SELECT is(
  (SELECT code_analytique FROM projets WHERE id = (SELECT id3 FROM _p)),
  (SELECT ref FROM projets WHERE id = (SELECT id3 FROM _p)),
  'Backfill : projet archive avec code NULL recupere sa ref');

-- 4. Bascule explicite de l'ancienne convention (11.01.CTR.COM -> ref).
UPDATE projets SET code_analytique = '11.01.CTR.COM'
WHERE id = (SELECT id3 FROM _p);

UPDATE projets SET code_analytique = ref WHERE code_analytique = '11.01.CTR.COM';

SELECT is(
  (SELECT code_analytique FROM projets WHERE id = (SELECT id3 FROM _p)),
  (SELECT ref FROM projets WHERE id = (SELECT id3 FROM _p)),
  'Bascule : ancien code 11.01.CTR.COM remplace par la ref');

-- 5. Invariant global post-migration : plus aucun projet sans code analytique
--    (le backfill de la migration a couvert tout l'existant, trigger ensuite).
SELECT is(
  (SELECT count(*) FROM projets WHERE code_analytique IS NULL),
  0::bigint,
  'Aucun projet avec code_analytique NULL apres migration');

SELECT * FROM finish();
ROLLBACK;

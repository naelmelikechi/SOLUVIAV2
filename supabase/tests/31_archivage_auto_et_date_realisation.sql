-- ===========================================================================
-- Test : invariants des triggers du module Projet
-- ===========================================================================
-- Migration : 20260807110000_correctifs_revue_securite_projet.sql
-- Contexte  : revue de securite du chantier Projet (7 lots).
--
-- Spec :
--   Correction 1 - archivage par regle vs synchronisation Eduvia
--     - un contrat archive par une regle NE PEUT PAS etre desarchive par une
--       ecriture qui repose seulement archive = false (ce que fait la sync)
--     - le desarchivage volontaire (archive = false ET archive_regle_id = NULL)
--       fonctionne toujours
--     - un archivage manuel (sans regle) reste desarchivable simplement
--   Correction 2 - contract_state_changed_at
--     - un UPDATE sans changement d'etat ne peut pas reecrire la date
--     - un vrai changement d'etat la repositionne
--   Correction 3 - date_realisation de la timeline de lancement
--     - premier passage en depose : posee au jour courant, la valeur fournie
--       par l'appelant est ignoree
--     - etape deja deposee : la date du premier depot est preservee
--     - retour sous depose : effacee, puis re-posee au redepot

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(9);

-- Setup ---------------------------------------------------------------------

CREATE TEMP TABLE _ctx (
  projet_id  UUID,
  regle_id   UUID,
  contrat_id UUID,
  manuel_id  UUID,
  etape_id   UUID
);

INSERT INTO _ctx (projet_id, regle_id, contrat_id, manuel_id, etape_id)
SELECT
  (SELECT id FROM projets ORDER BY created_at LIMIT 1),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid();

INSERT INTO contrats_regles_archivage (id, nom, etat_source, delai_jours, actif)
SELECT regle_id, 'Regle de test', 'TESTSTATE', 30, true FROM _ctx;

-- Deux contrats : l'un archive par la regle, l'autre archive a la main.
INSERT INTO contrats (
  id, eduvia_id, projet_id, contract_state, archive,
  archive_auto_le, archive_regle_id
)
SELECT contrat_id, 990001, projet_id, 'NOTSENT', true, now(), regle_id FROM _ctx
UNION ALL
SELECT manuel_id, 990002, projet_id, 'NOTSENT', true, NULL, NULL FROM _ctx;

INSERT INTO projet_lancement_etapes (id, projet_id, etape_key, statut)
SELECT etape_id, projet_id, 'nda', 'en_cours' FROM _ctx;

-- ----- Correction 1 --------------------------------------------------------

-- Test 1 : le coeur du bug. La sync Eduvia repose archive = false sur toutes
-- les lignes qu'elle voit ; l'archivage par regle doit y survivre.
UPDATE contrats SET archive = false, last_synced_at = now()
 WHERE id = (SELECT contrat_id FROM _ctx);

SELECT is(
  (SELECT archive FROM contrats WHERE id = (SELECT contrat_id FROM _ctx)),
  true,
  'Un contrat archive par une regle survit a une ecriture facon sync Eduvia'
);

-- Test 2 : la tracabilite reste coherente avec l'etat.
SELECT isnt(
  (SELECT archive_regle_id FROM contrats WHERE id = (SELECT contrat_id FROM _ctx)),
  NULL,
  'La regle qui a sorti le contrat reste renseignee'
);

-- Test 3 : desarchivage volontaire - la regle est effacee dans la meme
-- instruction, c'est ce que fait desarchiverContrat().
UPDATE contrats
   SET archive = false, archive_regle_id = NULL, archive_auto_le = NULL
 WHERE id = (SELECT contrat_id FROM _ctx);

SELECT is(
  (SELECT archive FROM contrats WHERE id = (SELECT contrat_id FROM _ctx)),
  false,
  'Le desarchivage volontaire fonctionne'
);

-- Test 4 : anti-regression. Un archivage manuel (sans regle) n'est pas
-- protege : il se desarchive comme avant.
UPDATE contrats SET archive = false WHERE id = (SELECT manuel_id FROM _ctx);

SELECT is(
  (SELECT archive FROM contrats WHERE id = (SELECT manuel_id FROM _ctx)),
  false,
  'Un contrat archive a la main reste desarchivable sans ceremonie'
);

-- ----- Correction 2 --------------------------------------------------------

UPDATE contrats SET contract_state = 'NOTSENT', archive = false
 WHERE id = (SELECT manuel_id FROM _ctx);
UPDATE contrats SET contract_state_changed_at = '2024-01-01T00:00:00Z'
 WHERE id = (SELECT manuel_id FROM _ctx);

-- Test 5 : aucun changement d'etat -> la date du payload est ignoree.
SELECT isnt(
  (SELECT contract_state_changed_at::date FROM contrats WHERE id = (SELECT manuel_id FROM _ctx)),
  DATE '2024-01-01',
  'contract_state_changed_at n est pas reecrivable sans changement d etat'
);

-- Test 6 : un vrai changement d'etat repositionne bien la date.
UPDATE contrats
   SET contract_state = 'SENT', contract_state_changed_at = '2024-01-01T00:00:00Z'
 WHERE id = (SELECT manuel_id FROM _ctx);

SELECT is(
  (SELECT contract_state_changed_at::date FROM contrats WHERE id = (SELECT manuel_id FROM _ctx)),
  CURRENT_DATE,
  'Un changement d etat repositionne contract_state_changed_at au jour courant'
);

-- ----- Correction 3 --------------------------------------------------------

-- Test 7 : l'exploit. Un CDP passe l'etape en depose en fournissant une date
-- de realisation anterieure pour neutraliser l'alerte "en retard".
UPDATE projet_lancement_etapes
   SET statut = 'depose', date_realisation = DATE '2026-06-01'
 WHERE id = (SELECT etape_id FROM _ctx);

SELECT is(
  (SELECT date_realisation FROM projet_lancement_etapes WHERE id = (SELECT etape_id FROM _ctx)),
  CURRENT_DATE,
  'Premier depot : la date fournie par l appelant est ignoree'
);

-- Test 8 : etape deja deposee. La date du premier depot fait foi.
UPDATE projet_lancement_etapes
   SET statut = 'lance', date_realisation = DATE '2026-06-01'
 WHERE id = (SELECT etape_id FROM _ctx);

SELECT is(
  (SELECT date_realisation FROM projet_lancement_etapes WHERE id = (SELECT etape_id FROM _ctx)),
  CURRENT_DATE,
  'Etape deja realisee : la date du premier depot est preservee'
);

-- Test 9 : retour en arriere puis redepot. La date est effacee, puis re-posee
-- au jour courant.
UPDATE projet_lancement_etapes
   SET statut = 'en_cours' WHERE id = (SELECT etape_id FROM _ctx);

SELECT is(
  (SELECT date_realisation FROM projet_lancement_etapes WHERE id = (SELECT etape_id FROM _ctx)),
  NULL::date,
  'Retour sous depose : la date de realisation est effacee'
);

SELECT * FROM finish();
ROLLBACK;

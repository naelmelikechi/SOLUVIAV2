-- ===========================================================================
-- Test : gapless invoice numbering (sprint 6)
-- ===========================================================================
-- Invariant metier : la sequence numero_seq des factures (par tenant) est
-- strictement contigue. Un trou indique une facture detruite ou un trigger
-- casse, c'est une non-conformite legale francaise (CGI art. 289).
--
-- Tests :
--   1. Insert facture statut 'a_emettre' -> ref + numero_seq restent NULL
--   2. UPDATE statut 'a_emettre' -> 'emise' -> ref attribue, numero_seq = max+1
--   3. Deux UPDATE concurrents (simulation via SAVEPOINT) -> chacun obtient
--      un numero distinct, jamais doublon
--   4. DELETE sur facture 'emise' -> doit echouer (RLS ou trigger)
--   5. Sequence reste contigue apres N envois
--
-- Pour lancer : `npx supabase test db`. Le harness applique les migrations
-- avant chaque fichier de test.

BEGIN;
SELECT plan(7);

-- Setup : un client de test + un projet
DO $$
DECLARE
  v_client_id UUID := gen_random_uuid();
  v_projet_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO clients (id, raison_sociale, trigramme, is_demo)
  VALUES (v_client_id, 'Test Gapless SAS', 'GAP', false);

  INSERT INTO projets (id, client_id, ref, statut, est_interne, archive)
  VALUES (v_projet_id, v_client_id, 'GAP-PROJ-0001', 'actif', false, false);

  -- Stocke pour les tests suivants
  PERFORM set_config('test.client_id', v_client_id::text, true);
  PERFORM set_config('test.projet_id', v_projet_id::text, true);
END $$;

-- Test 1 : insert brouillon -> ref NULL
WITH inserted AS (
  INSERT INTO factures (
    projet_id, client_id, date_emission, date_echeance, mois_concerne,
    montant_ht, taux_tva, montant_tva, montant_ttc,
    statut, est_avoir
  )
  VALUES (
    current_setting('test.projet_id')::uuid,
    current_setting('test.client_id')::uuid,
    '2026-05-01', '2026-06-30', '2026-05',
    1000, 20, 200, 1200,
    'a_emettre', false
  )
  RETURNING id, ref, numero_seq
)
SELECT is(ref, NULL, 'ref est NULL pour un brouillon')
FROM inserted;

-- Test 2 : transition emise -> ref + numero_seq attribues
-- (Necessite un trigger BEFORE UPDATE sur factures qui set ref + numero_seq
--  quand OLD.statut = 'a_emettre' AND NEW.statut IN ('emise','avoir'))
SELECT skip(
  'Test 2-7 : a implementer apres avoir setup le harness pgTAP. '
  'Ce fichier est un squelette qui documente l intention. Voir '
  'supabase/tests/README.md pour le runner.',
  6
);

SELECT * FROM finish();
ROLLBACK;

-- ===========================================================================
-- Test : Coherence FK projets.categorie_interne_id <-> est_interne
-- ===========================================================================
-- Migration : 20260512141303_categories_internes_table.sql
--
-- Spec :
--   - est_interne = true => categorie_interne_id obligatoire
--   - est_interne = false => categorie_interne_id doit etre NULL

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(4);

CREATE TEMP TABLE _ctx (
  client_id UUID,
  typo_id UUID,
  cat_id UUID
);

INSERT INTO _ctx (client_id, typo_id, cat_id) VALUES (
  gen_random_uuid(),
  (SELECT id FROM typologies_projet LIMIT 1),
  (SELECT id FROM categories_internes WHERE code = 'formation' LIMIT 1)
);

INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test FK Coherence', 'TFK', false, false FROM _ctx;

-- Test 1 : projet client (est_interne=false) sans categorie_interne_id : OK
SELECT lives_ok($$
  INSERT INTO projets (client_id, typologie_id, ref, statut, est_interne, archive)
  SELECT client_id, typo_id, 'TFK-001', 'actif', false, false FROM _ctx
$$, 'Projet client (est_interne=false) sans categorie : INSERT autorise');

-- Test 2 : projet client AVEC categorie_interne_id : doit echouer
SELECT throws_ok($$
  INSERT INTO projets (client_id, typologie_id, ref, statut, est_interne, archive, categorie_interne_id)
  SELECT client_id, typo_id, 'TFK-002', 'actif', false, false, cat_id FROM _ctx
$$,
  '23514',
  NULL,
  'Projet client AVEC categorie_interne_id : check_violation'
);

-- Test 3 : projet interne SANS categorie_interne_id : doit echouer
SELECT throws_ok($$
  INSERT INTO projets (client_id, typologie_id, ref, statut, est_interne, archive)
  SELECT client_id, typo_id, 'TFK-003', 'actif', true, false FROM _ctx
$$,
  '23514',
  NULL,
  'Projet interne SANS categorie : check_violation'
);

-- Test 4 : projet interne AVEC categorie_interne_id : OK
SELECT lives_ok($$
  INSERT INTO projets (client_id, typologie_id, ref, statut, est_interne, archive, categorie_interne_id)
  SELECT client_id, typo_id, 'TFK-004', 'actif', true, false, cat_id FROM _ctx
$$, 'Projet interne avec categorie_interne_id : INSERT autorise');

SELECT * FROM finish();
ROLLBACK;

-- ===========================================================================
-- Test : get_or_create_projet_libre + invariants du projet libre
-- ===========================================================================
-- Migration : 20260630120000_projets_libre.sql
-- Spec : docs/superpowers/specs/2026-06-29-projet-libre-design.md (sections 1-2)

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(9);

CREATE TEMP TABLE _ctx (client_id UUID);
INSERT INTO _ctx (client_id) VALUES (gen_random_uuid());
INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Projet Libre', 'TLB', false, false FROM _ctx;

-- Premier appel : cree
CREATE TEMP TABLE _r (id1 UUID, id2 UUID);
INSERT INTO _r (id1) SELECT get_or_create_projet_libre((SELECT client_id FROM _ctx));

SELECT isnt((SELECT id1 FROM _r), NULL, 'Premier appel cree un projet libre (id non null)');

SELECT is(
  (SELECT est_libre FROM projets WHERE id = (SELECT id1 FROM _r)),
  true, 'Le projet cree a est_libre = true');

SELECT is(
  (SELECT taux_commission FROM projets WHERE id = (SELECT id1 FROM _r)),
  0::numeric(5,2), 'taux_commission = 0 (aligne est_interne, pas de partage)');

SELECT is(
  (SELECT cdp_id FROM projets WHERE id = (SELECT id1 FROM _r)),
  NULL, 'cdp_id NULL (admin-only)');

SELECT is(
  (SELECT t.code FROM projets p JOIN typologies_projet t ON t.id = p.typologie_id
   WHERE p.id = (SELECT id1 FROM _r)),
  'LIB', 'typologie LIB');

SELECT matches(
  (SELECT ref FROM projets WHERE id = (SELECT id1 FROM _r)),
  '^[0-9]{4}-TLB-LIB$', 'ref auto-genere NNNN-TLB-LIB');

-- Deuxieme appel : reutilise (idempotent)
UPDATE _r SET id2 = get_or_create_projet_libre((SELECT client_id FROM _ctx));
SELECT is((SELECT id1 FROM _r), (SELECT id2 FROM _r),
  'Deuxieme appel reutilise le meme projet (idempotent)');

-- Un seul projet libre par client (index unique partiel)
SELECT throws_ok($$
  INSERT INTO projets (client_id, typologie_id, est_libre, statut, archive, taux_commission)
  SELECT client_id, (SELECT id FROM typologies_projet WHERE code='LIB'), true, 'actif', false, 0
  FROM _ctx
$$, '23505', NULL, 'Deuxieme projet libre direct pour le meme client : unique_violation');

-- Exclusivite est_interne / est_libre (CHECK)
SELECT throws_ok($$
  UPDATE projets SET est_libre = true WHERE ref = '9001-INT-FOR'
$$, '23514', NULL, 'est_interne + est_libre simultanes : check_violation');

SELECT * FROM finish();
ROLLBACK;

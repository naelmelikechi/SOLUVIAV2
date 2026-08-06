-- ===========================================================================
-- Test : la branche `backup_cdp_id` des policies RLS
-- ===========================================================================
-- Contexte : audit #122, constat 18a.
--
-- Le CDP de secours (`projets.backup_cdp_id`) doit voir le projet et toute sa
-- descendance, exactement comme le CDP titulaire. Cette branche n'etait
-- exercee par AUCUN test : les seules occurrences de `backup_cdp_id` dans
-- supabase/tests/ etaient des fixtures de cascade, sans aucun set_config JWT.
--
-- Le risque est concret : la migration 20260615130000 a reecrit une vingtaine
-- de policies d'un bloc pour une optimisation initplan. C'est exactement le
-- type de reecriture en masse ou un `OR backup_cdp_id = ...` peut sauter sans
-- que rien ne le signale. Et il n'y a aucun filet applicatif :
-- lib/queries/projets.ts n'applique aucun filtre CDP, il repose entierement
-- sur la RLS.
--
-- Perimetre reel releve sur la production : 26 policies referencent
-- `backup_cdp_id`, et non 6 comme l'annoncait le rapport. Ce test couvre la
-- chaine financiere, la plus sensible : projets, contrats, factures,
-- facture_lignes, paiements, kpi_snapshots.
--
-- Spec verifiee :
--   - le CDP titulaire voit sa ligne sur les 6 tables
--   - le CDP de SECOURS la voit aussi (le coeur du test)
--   - un CDP tiers ne voit rien, sur les 6 tables

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(18);

-- ----- Setup (superuser, donc RLS contournee) ------------------------------

CREATE TEMP TABLE _ctx (
  cdp_titulaire UUID,
  cdp_secours UUID,
  cdp_tiers UUID,
  client_id UUID,
  projet_id UUID,
  contrat_id UUID,
  facture_id UUID
);
INSERT INTO _ctx (cdp_titulaire, cdp_secours, cdp_tiers, client_id, projet_id)
VALUES (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid()
);

INSERT INTO auth.users (id, email)
SELECT cdp_titulaire, 'cdp-titulaire@test.local' FROM _ctx
UNION ALL SELECT cdp_secours, 'cdp-secours@test.local' FROM _ctx
UNION ALL SELECT cdp_tiers, 'cdp-tiers@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role, actif)
SELECT cdp_titulaire, 'cdp-titulaire@test.local', 'Titulaire', 'Cdp',
       'cdp'::role_utilisateur, true FROM _ctx
UNION ALL
SELECT cdp_secours, 'cdp-secours@test.local', 'Secours', 'Cdp',
       'cdp'::role_utilisateur, true FROM _ctx
UNION ALL
SELECT cdp_tiers, 'cdp-tiers@test.local', 'Tiers', 'Cdp',
       'cdp'::role_utilisateur, true FROM _ctx;

INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Backup CDP SAS', 'BKP', false, false FROM _ctx;

-- Le projet : titulaire ET secours. chk_cdp_different impose qu'ils diffèrent.
INSERT INTO projets (
  id, client_id, typologie_id, ref, statut, est_interne, archive,
  cdp_id, backup_cdp_id
)
SELECT
  c.projet_id, c.client_id,
  (SELECT id FROM typologies_projet LIMIT 1),
  'BKP-TST-0001', 'actif', false, false,
  c.cdp_titulaire, c.cdp_secours
FROM _ctx c;

UPDATE _ctx SET contrat_id = gen_random_uuid();
INSERT INTO contrats (
  id, projet_id, eduvia_id, contract_state, archive,
  contract_number, formation_titre, apprenant_nom, apprenant_prenom
)
SELECT contrat_id, projet_id, 8100001, 'En cours', false,
       'CTR-BKP-001', 'Formation Backup', 'Doe', 'John'
FROM _ctx;

INSERT INTO factures (
  projet_id, client_id, date_emission, date_echeance, mois_concerne,
  montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
  societe_emettrice_id
)
SELECT projet_id, client_id, '2026-05-01', '2026-06-30', '2026-05',
       1000, 20, 200, 1200, 'a_emettre', false,
       (SELECT id FROM societes_emettrices WHERE code = 'SOL')
FROM _ctx
RETURNING id;

UPDATE _ctx SET facture_id = (
  SELECT id FROM factures WHERE projet_id = (SELECT projet_id FROM _ctx)
  ORDER BY created_at DESC LIMIT 1
);

INSERT INTO facture_lignes (facture_id, contrat_id, description, montant_ht)
SELECT facture_id, contrat_id, 'Ligne backup cdp', 1000 FROM _ctx;

INSERT INTO paiements (facture_id, montant, date_reception, saisie_manuelle)
SELECT facture_id, 1200, '2026-06-15', true FROM _ctx;

INSERT INTO kpi_snapshots (mois, type_kpi, valeur, scope, scope_id)
SELECT '2026-05-01', 'test_backup_cdp', 42, 'projet'::scope_kpi, projet_id
FROM _ctx;

-- ----- Helper : compte les lignes visibles sous une identite ---------------

CREATE OR REPLACE FUNCTION pg_temp.visible_as(
  p_user_id UUID,
  p_sql TEXT
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL role authenticated;
  EXECUTE p_sql INTO v_count;
  RESET role;
  RETURN v_count;
END;
$$;

-- SQL de comptage, scope au jeu de donnees du test uniquement.
CREATE OR REPLACE FUNCTION pg_temp.q(p_table TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_table
    WHEN 'projets' THEN
      'SELECT count(*)::int FROM projets WHERE ref = ''BKP-TST-0001'''
    WHEN 'contrats' THEN
      'SELECT count(*)::int FROM contrats WHERE contract_number = ''CTR-BKP-001'''
    WHEN 'factures' THEN
      'SELECT count(*)::int FROM factures WHERE mois_concerne = ''2026-05''
         AND projet_id IN (SELECT id FROM projets WHERE ref = ''BKP-TST-0001'')'
    WHEN 'facture_lignes' THEN
      'SELECT count(*)::int FROM facture_lignes WHERE description = ''Ligne backup cdp'''
    WHEN 'paiements' THEN
      'SELECT count(*)::int FROM paiements WHERE date_reception = ''2026-06-15''
         AND facture_id IN (SELECT id FROM factures WHERE projet_id IN
           (SELECT id FROM projets WHERE ref = ''BKP-TST-0001''))'
    WHEN 'kpi_snapshots' THEN
      'SELECT count(*)::int FROM kpi_snapshots WHERE type_kpi = ''test_backup_cdp'''
  END;
$$;

-- ----- Tests ---------------------------------------------------------------
-- 6 tables x 3 identites. Le bloc central est le coeur du constat 18a.

-- Le CDP titulaire voit tout (reference : si ces 6 echouent, le test est faux).
SELECT is(
  (SELECT pg_temp.visible_as(cdp_titulaire, pg_temp.q('projets')) FROM _ctx),
  1, 'titulaire voit son projet'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_titulaire, pg_temp.q('contrats')) FROM _ctx),
  1, 'titulaire voit le contrat'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_titulaire, pg_temp.q('factures')) FROM _ctx),
  1, 'titulaire voit la facture'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_titulaire, pg_temp.q('facture_lignes')) FROM _ctx),
  1, 'titulaire voit la ligne de facture'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_titulaire, pg_temp.q('paiements')) FROM _ctx),
  1, 'titulaire voit le paiement'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_titulaire, pg_temp.q('kpi_snapshots')) FROM _ctx),
  1, 'titulaire voit le snapshot KPI'
);

-- LE COEUR DU TEST : le CDP de secours voit exactement la meme chose.
SELECT is(
  (SELECT pg_temp.visible_as(cdp_secours, pg_temp.q('projets')) FROM _ctx),
  1, 'backup_cdp voit le projet'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_secours, pg_temp.q('contrats')) FROM _ctx),
  1, 'backup_cdp voit le contrat'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_secours, pg_temp.q('factures')) FROM _ctx),
  1, 'backup_cdp voit la facture'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_secours, pg_temp.q('facture_lignes')) FROM _ctx),
  1, 'backup_cdp voit la ligne de facture'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_secours, pg_temp.q('paiements')) FROM _ctx),
  1, 'backup_cdp voit le paiement'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_secours, pg_temp.q('kpi_snapshots')) FROM _ctx),
  1, 'backup_cdp voit le snapshot KPI'
);

-- Contre-epreuve : un CDP tiers ne voit rien. Sans ces 6 assertions, un
-- `USING (true)` accidentel ferait passer les 12 precedentes.
SELECT is(
  (SELECT pg_temp.visible_as(cdp_tiers, pg_temp.q('projets')) FROM _ctx),
  0, 'un CDP tiers ne voit pas le projet'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_tiers, pg_temp.q('contrats')) FROM _ctx),
  0, 'un CDP tiers ne voit pas le contrat'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_tiers, pg_temp.q('factures')) FROM _ctx),
  0, 'un CDP tiers ne voit pas la facture'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_tiers, pg_temp.q('facture_lignes')) FROM _ctx),
  0, 'un CDP tiers ne voit pas la ligne de facture'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_tiers, pg_temp.q('paiements')) FROM _ctx),
  0, 'un CDP tiers ne voit pas le paiement'
);
SELECT is(
  (SELECT pg_temp.visible_as(cdp_tiers, pg_temp.q('kpi_snapshots')) FROM _ctx),
  0, 'un CDP tiers ne voit pas le snapshot KPI'
);

SELECT * FROM finish();
ROLLBACK;

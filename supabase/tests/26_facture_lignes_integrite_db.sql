-- ===========================================================================
-- Test : integrite DB facture_lignes (20260630141000)
--   * immutabilite column-scoped post-emission (gel des lignes, allowlist
--     analytic_line_odoo_id / opco_code pour le sync Odoo)
--   * SUM(lignes) = header (recompute brouillon 2a + filet emission 2b)
-- Calque sur supabase/tests/21_factures_projet_libre.sql (helpers _ctx,
-- societes_emettrices code='SOL', get_or_create_projet_libre, lignes
-- contrat_id NULL). Pas de RLS testee ici -> pas de set_config jwt.
-- ===========================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(14);

CREATE TEMP TABLE _ctx (
  admin_id UUID, client_id UUID, libre_id UUID, fac_id UUID, ligne_id UUID
);
INSERT INTO _ctx (admin_id, client_id, fac_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email) SELECT admin_id, 'admin-fl@test.local' FROM _ctx;
INSERT INTO public.users (id, email, prenom, nom, role)
  SELECT admin_id, 'admin-fl@test.local', 'Admin', 'FL', 'admin'::role_utilisateur FROM _ctx;
INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
  SELECT client_id, 'Test FL Integrite', 'TFI', false, false FROM _ctx;
UPDATE _ctx SET libre_id = get_or_create_projet_libre((SELECT client_id FROM _ctx));

-- Brouillon avec header volontairement FAUX (montant_ht=999) pour prouver le
-- recompute. id explicite (capte dans _ctx.fac_id) : pas de ref tant que
-- a_emettre, donc on ne peut pas retrouver la facture par ref.
INSERT INTO factures (id, projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      societe_emettrice_id)
SELECT fac_id, libre_id, client_id, '2026-06-01', '2026-07-31', '2026-06',
       999, 20, 199.80, 1198.80, 'a_emettre', false,
       (SELECT id FROM societes_emettrices WHERE code='SOL') FROM _ctx;

-- ----- A1 : INSERT de ligne autorise sur brouillon -----
SELECT lives_ok($$
  INSERT INTO facture_lignes (facture_id, contrat_id, description, montant_ht, taux_tva_ligne)
  SELECT fac_id, NULL, 'Ligne A', 100, 20 FROM _ctx
$$, 'INSERT ligne autorise tant que a_emettre');

-- ----- A2 : recompute brouillon -> header aligne sur SUM(lignes) malgre le header faux -----
SELECT is((SELECT montant_ht  FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 100::numeric(12,2),
          'recompute (a_emettre): montant_ht = SUM(lignes) (header faux ecrase)');
SELECT is((SELECT montant_tva FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 20::numeric(12,2),
          'recompute (a_emettre): montant_tva = round_half_up(100*20)/100');
SELECT is((SELECT montant_ttc FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 120::numeric(12,2),
          'recompute (a_emettre): montant_ttc = ht + tva');

-- ----- A3 : 2e ligne, recompute cumulatif -----
SELECT lives_ok($$
  INSERT INTO facture_lignes (facture_id, contrat_id, description, montant_ht, taux_tva_ligne)
  SELECT fac_id, NULL, 'Ligne B', 50, 20 FROM _ctx
$$, 'INSERT 2e ligne autorise');
SELECT is((SELECT montant_ht FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 150::numeric(12,2),
          'recompute cumulatif: montant_ht = 150');

-- ----- A4 : filet d'emission. On desynchronise le header A LA MAIN puis on emet. -----
-- (UPDATE direct du header sur brouillon : autorise, ne declenche pas le trigger ligne.)
UPDATE factures SET montant_ht=1, montant_tva=0, montant_ttc=1 WHERE id=(SELECT fac_id FROM _ctx);
UPDATE factures SET statut='emise' WHERE id=(SELECT fac_id FROM _ctx);  -- emission
SELECT is((SELECT montant_ht FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 150::numeric(12,2),
          'filet emission: header re-derive depuis lignes (150), header stale corrige');
SELECT isnt((SELECT ref FROM factures WHERE id=(SELECT fac_id FROM _ctx)), NULL,
          'emission: ref gapless attribue (assign_ref_on_send intact)');

-- capture une ligne pour les tests post-emission
UPDATE _ctx SET ligne_id =
  (SELECT id FROM facture_lignes WHERE facture_id=(SELECT fac_id FROM _ctx) AND description='Ligne A');

-- ----- A5 : UPDATE montant_ht d'une ligne post-emission -> REJETE -----
SELECT throws_ok($$
  UPDATE facture_lignes SET montant_ht=999 WHERE id=(SELECT ligne_id FROM _ctx)
$$, 'P0001', NULL, 'UPDATE montant_ht ligne post-emission rejete (immutabilite)');

-- ----- A6 : DELETE ligne post-emission -> REJETE -----
SELECT throws_ok($$
  DELETE FROM facture_lignes WHERE id=(SELECT ligne_id FROM _ctx)
$$, 'P0001', NULL, 'DELETE ligne post-emission rejete (immutabilite)');

-- ----- A7 : INSERT ligne post-emission -> REJETE -----
SELECT throws_ok($$
  INSERT INTO facture_lignes (facture_id, contrat_id, description, montant_ht, taux_tva_ligne)
  SELECT fac_id, NULL, 'Ligne illegale', 10, 20 FROM _ctx
$$, 'P0001', NULL, 'INSERT ligne post-emission rejete (immutabilite)');

-- ----- A8 : UPDATE analytic_line_odoo_id post-emission -> AUTORISE (sync Odoo) -----
SELECT lives_ok($$
  UPDATE facture_lignes SET analytic_line_odoo_id='AL-123' WHERE id=(SELECT ligne_id FROM _ctx)
$$, 'UPDATE analytic_line_odoo_id autorise post-emission (push Odoo)');

-- ----- A8bis : jumeau opco_code, 2e colonne de l'allowlist -> AUTORISE -----
SELECT lives_ok($$
  UPDATE facture_lignes SET opco_code='OPCO-X' WHERE id=(SELECT ligne_id FROM _ctx)
$$, 'UPDATE opco_code autorise post-emission (2e colonne allowlist)');

-- ----- A9 : ces writes ne reactivent PAS le recompute (header inchange) -----
SELECT is((SELECT montant_ht FROM factures WHERE id=(SELECT fac_id FROM _ctx)), 150::numeric(12,2),
          'write analytic/opco post-emission ne recalcule pas le header (no-op recompute)');

SELECT * FROM finish();
ROLLBACK;

-- Integrite DB des facture_lignes : immutabilite post-emission (column-scoped)
-- + invariant SUM(facture_lignes.montant_ht) = factures.montant_ht garanti en base.
-- Miroir du couple devis (recompute_devis_totaux) / facture (freeze_facture_after_emission).
-- Spec : docs/superpowers/specs/2026-06-30-facture-lignes-integrite-db.md
--
-- Trois objets :
--   1. freeze_facture_lignes_after_emission (BEFORE INSERT/UPDATE/DELETE) : gel
--      column-scoped des lignes une fois la facture sortie de 'a_emettre'.
--   2. recompute_facture_totaux (AFTER INSERT/UPDATE/DELETE) : re-derive le header
--      depuis l'agregat des lignes tant que la facture est 'a_emettre'.
--   3. recompute_facture_totaux_on_emission (BEFORE UPDATE OF statut) : filet qui
--      re-derive le header au moment exact de l'emission (anti-header-stale).
--
-- COEXISTENCE app + trigger (choix de portee) : le recompute applicatif
-- (recomputeFactureTotaux, lib/actions/facture-lignes.ts) est CONSERVE dans ce
-- pass. Le trigger DB devient l'autorite/garant ; l'app reste en ceinture-
-- bretelles (elle ecrit la meme valeur, le trigger la reecrit a l'identique -
-- doublon inoffensif). Le retrait de l'UPDATE app est un follow-up separe (cf.
-- spec §Deploiement etape 3), volontairement hors de cette migration pour ne pas
-- casser les tests unitaires de parite facture-totaux-recompute.
--
-- CONVENTION D'ORDRE DES TRIGGERS BEFORE UPDATE sur factures (nommage
-- alphabetique) : assign_ref_on_send < freeze_after_emission <
-- recompute_on_emission < updated. Tout futur trigger touchant les montants
-- DOIT trier apres recompute_on_emission, sinon il ecraserait le filet.
--
-- Additif : aucun UPDATE/backfill de donnees existantes. Recompute-not-validate
-- (convergence, pas rejet) -> ne rend la migration contraignante sur aucune ligne
-- deja emise.

-- ===========================================================================
-- 1. Gel column-scoped des lignes apres emission
-- ===========================================================================
-- Gele post-emission : montant_ht, contrat_id, description, taux_tva_ligne,
--   event_type, event_source_id, mois_relatif, quote_part, npec_snapshot,
--   taux_commission_snapshot, est_avoir, facture_id, created_at, id, et toute
--   colonne future.
-- AUTORISE post-emission : analytic_line_odoo_id, opco_code (push Odoo,
--   cf. lib/odoo/sync.ts pushFactures : persistance analytic_line_odoo_id apres
--   emission). Allowlist par soustraction JSON : toute future colonne est gelee
--   par defaut (defaut sur pour une table a valeur legale).
CREATE OR REPLACE FUNCTION freeze_facture_lignes_after_emission()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_facture_id UUID;
  v_statut     statut_facture;
  v_ref        TEXT;
BEGIN
  v_facture_id := COALESCE(NEW.facture_id, OLD.facture_id);
  SELECT statut, ref INTO v_statut, v_ref FROM factures WHERE id = v_facture_id;

  -- Parent absent (CASCADE delete du brouillon : la facture parente est deja
  -- supprimee quand le BEFORE DELETE des lignes filles se declenche).
  IF v_statut IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Brouillon : CRUD lignes libre.
  IF v_statut = 'a_emettre' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Facture emise/avoir/payee/en_retard : immuable.
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'Facture %: ajout de ligne interdit apres emission (statut=%). Emettez un avoir.',
      v_ref, v_statut;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Facture %: suppression de ligne interdite apres emission (statut=%). Emettez un avoir.',
      v_ref, v_statut;
  END IF;

  -- UPDATE : seules analytic_line_odoo_id et opco_code sont modifiables.
  IF (to_jsonb(NEW) - 'analytic_line_odoo_id' - 'opco_code')
       IS DISTINCT FROM
     (to_jsonb(OLD) - 'analytic_line_odoo_id' - 'opco_code') THEN
    RAISE EXCEPTION
      'Facture %: lignes immutables apres emission (statut=%). Seuls analytic_line_odoo_id et opco_code (sync Odoo) sont modifiables.',
      v_ref, v_statut;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION freeze_facture_lignes_after_emission() SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_facture_lignes_freeze_after_emission ON facture_lignes;
CREATE TRIGGER trg_facture_lignes_freeze_after_emission
BEFORE INSERT OR UPDATE OR DELETE ON facture_lignes
FOR EACH ROW EXECUTE FUNCTION freeze_facture_lignes_after_emission();

-- ===========================================================================
-- 2a. Recompute du header depuis les lignes (tant que 'a_emettre')
-- ===========================================================================
-- Parite EXACTE avec computeFactureTotaux (lib/utils/facture-totaux.ts) :
-- round_half_up(x) = floor(x + 0.5) reproduit Math.round (JS, demi vers +inf),
-- y compris pour les avoirs (montants < 0). TVA par ligne :
-- floor(montant_ht * taux_ligne + 0.5) / 100, taux_ligne =
-- COALESCE(taux_tva_ligne, header.taux_tva, 20). Cumul puis round2.
-- Pas de recursion : l'UPDATE factures ne touche ni statut ni est_avoir ni
-- aucune facture_lignes -> ne declenche ni assign_ref_on_send ni
-- propagate_est_avoir ni ce trigger. freeze_after_emission voit
-- OLD.statut='a_emettre' et passe.
CREATE OR REPLACE FUNCTION recompute_facture_totaux()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_facture_id  UUID;
  v_statut      statut_facture;
  v_taux_header NUMERIC(5,2);
  v_ht          NUMERIC(12,2);
  v_tva         NUMERIC(12,2);
BEGIN
  v_facture_id := COALESCE(NEW.facture_id, OLD.facture_id);
  SELECT statut, COALESCE(taux_tva, 20) INTO v_statut, v_taux_header
  FROM factures WHERE id = v_facture_id;

  -- Parent absent (cascade) ou deja emis : pas de recalcul (header gele ;
  -- le seul write post-emission ne touche aucun montant).
  IF v_statut IS DISTINCT FROM 'a_emettre' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(floor(SUM(montant_ht) * 100 + 0.5) / 100, 0),
    COALESCE(SUM(floor(montant_ht * COALESCE(taux_tva_ligne, v_taux_header) + 0.5) / 100), 0)
  INTO v_ht, v_tva
  FROM facture_lignes
  WHERE facture_id = v_facture_id;

  v_tva := floor(v_tva * 100 + 0.5) / 100;  -- round2 du cumul TVA

  UPDATE factures
     SET montant_ht  = v_ht,
         montant_tva = v_tva,
         montant_ttc = floor((v_ht + v_tva) * 100 + 0.5) / 100,
         taux_tva    = CASE WHEN v_ht <> 0
                            THEN floor((v_tva / v_ht) * 100 * 100 + 0.5) / 100
                            ELSE v_taux_header END
   WHERE id = v_facture_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION recompute_facture_totaux() SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_facture_lignes_recompute ON facture_lignes;
CREATE TRIGGER trg_facture_lignes_recompute
AFTER INSERT OR UPDATE OR DELETE ON facture_lignes
FOR EACH ROW EXECUTE FUNCTION recompute_facture_totaux();

-- ===========================================================================
-- 2b. Filet d'emission : re-derive le header depuis les lignes a l'emission
-- ===========================================================================
-- BEFORE UPDATE OF statut sur factures : au passage a_emettre -> autre,
-- re-derive NEW.montant_ht/tva/ttc/taux_tva depuis les lignes, dans la
-- transaction d'emission elle-meme. Ferme le trou "header stale fige" :
-- sendFacture ne recalcule pas, et un UPDATE direct du header sur brouillon
-- (qui ne declenche pas 2a) pourrait desynchroniser avant emission.
-- freeze_after_emission laisse passer (OLD.statut='a_emettre') quel que soit
-- l'ordre des triggers.
CREATE OR REPLACE FUNCTION recompute_facture_totaux_on_emission()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_taux_header NUMERIC(5,2) := COALESCE(NEW.taux_tva, 20);
  v_ht          NUMERIC(12,2);
  v_tva         NUMERIC(12,2);
BEGIN
  IF OLD.statut <> 'a_emettre' OR NEW.statut = 'a_emettre' THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(floor(SUM(montant_ht) * 100 + 0.5) / 100, 0),
    COALESCE(SUM(floor(montant_ht * COALESCE(taux_tva_ligne, v_taux_header) + 0.5) / 100), 0)
  INTO v_ht, v_tva
  FROM facture_lignes WHERE facture_id = NEW.id;

  v_tva := floor(v_tva * 100 + 0.5) / 100;

  NEW.montant_ht  := v_ht;
  NEW.montant_tva := v_tva;
  NEW.montant_ttc := floor((v_ht + v_tva) * 100 + 0.5) / 100;
  NEW.taux_tva    := CASE WHEN v_ht <> 0
                          THEN floor((v_tva / v_ht) * 100 * 100 + 0.5) / 100
                          ELSE v_taux_header END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION recompute_facture_totaux_on_emission() SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_factures_recompute_on_emission ON factures;
CREATE TRIGGER trg_factures_recompute_on_emission
BEFORE UPDATE OF statut ON factures
FOR EACH ROW EXECUTE FUNCTION recompute_facture_totaux_on_emission();

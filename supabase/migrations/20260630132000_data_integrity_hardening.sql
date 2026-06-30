-- Durcissement integrite donnees (audit 2026-06-30, vague 2).
-- Preconditions verifiees en PROD avant ecriture (toutes a 0) : aucun doublon
-- siret, aucun doublon ajustement unresolved, aucun taux_tva hors [0;100],
-- aucun paiement a 0 -> ces contraintes/index sont additifs et passent la
-- validation au merge (Supavia applique les migrations sur push main).

-- 1. (P1, BUG ACTIF EN PROD) prospects.siret : l'index unique etait PARTIEL
-- (`WHERE siret IS NOT NULL`). PostgREST n'infere pas un index partiel pour
-- `ON CONFLICT (siret)` -> l'upsert de l'import CFA (lib/actions/prospects/
-- import-excel.ts:223) echoue des le 1er chunk ("no unique or exclusion
-- constraint matching the ON CONFLICT specification"), pas seulement sur
-- doublon. Bug IDENTIQUE a paiements.odoo_id, deja corrige en 20260601001000.
-- Un index unique PLEIN autorise tout autant plusieurs siret NULL (NULLS
-- DISTINCT) et devient inferable par onConflict:'siret'.
DROP INDEX IF EXISTS public.idx_prospects_siret_unique;
CREATE UNIQUE INDEX idx_prospects_siret_unique ON public.prospects (siret);

-- 2. (P2) echeances.facture_id : FK sans clause ON DELETE (defaut NO ACTION)
-- alors que l'intention metier est le DETACH (deleteBrouillon nulle facture_id
-- a la main avant suppression, brouillon-mutations.ts). On aligne la contrainte
-- sur l'intention : ON DELETE SET NULL. Sur, car une facture emise n'est jamais
-- supprimee (gapless) ; seuls les brouillons le sont -> leurs echeances
-- redeviennent libres automatiquement.
ALTER TABLE public.echeances DROP CONSTRAINT IF EXISTS echeances_facture_id_fkey;
ALTER TABLE public.echeances
  ADD CONSTRAINT echeances_facture_id_fkey
  FOREIGN KEY (facture_id) REFERENCES public.factures(id) ON DELETE SET NULL;

-- 3. (P2) facturation_ajustements_pending : la dedup applicative est un
-- check-then-insert (TOCTOU). Deux syncs Eduvia qui se chevauchent inserent 2
-- lignes unresolved pour (contrat_id, type) ; ensuite le `.maybeSingle()` de la
-- detection LEVE (PGRST116) et casse toute detection NPEC/rupture du contrat.
-- Unique partiel sur la cle naturelle des lignes non resolues.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ajustements_pending_contrat_type_unresolved
  ON public.facturation_ajustements_pending (contrat_id, type)
  WHERE resolved_at IS NULL;

-- 4. (P3) Bornes TVA, parite avec devis_lignes (qui a deja CHECK taux_tva>=0).
-- L'app clampe 0..100 cote Zod ; un write direct (PostgREST/SQL) ne l'etait pas.
ALTER TABLE public.factures
  ADD CONSTRAINT chk_factures_taux_tva_borne
  CHECK (taux_tva IS NULL OR (taux_tva >= 0 AND taux_tva <= 100));
ALTER TABLE public.facture_lignes
  ADD CONSTRAINT chk_fl_taux_tva_borne
  CHECK (taux_tva_ligne IS NULL OR (taux_tva_ligne >= 0 AND taux_tva_ligne <= 100));

-- 5. (P3) paiements.montant <> 0 : fiabilise le flip statut 'payee'
-- (SUM(paiements) >= montant_ttc). addManualPayment valide deja > 0 ; l'upsert
-- du cron Odoo (sync.ts) n'etait borne par rien. (0 paiement nul en prod.)
ALTER TABLE public.paiements
  ADD CONSTRAINT chk_paiements_montant_non_nul CHECK (montant <> 0);

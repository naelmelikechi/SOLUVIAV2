-- Migration : taux HEOL passe a 40% + drop des constraints/index sur billing_mode.
-- La colonne billing_mode elle-meme est conservee transitoirement (cf
-- migration 20260514100000 qui la dropera apres soak du code PR 3).
-- Spec : docs/superpowers/specs/2026-05-12-base-commission-pedago-design.md
--
-- IMPORTANT : a appliquer apres deploiement du code PR 3 qui ne lit/ecrit
-- plus billing_mode (cleanup PR 3 du chantier base-pedago).

-- 1. UPDATE taux HEOL (50 → 40).
UPDATE public.projets
   SET taux_commission = 40
 WHERE ref = '0015-HED-APP'
   AND taux_commission = 50;

-- 2. Suppression de l'index partiel sur billing_mode='manual'.
DROP INDEX IF EXISTS public.idx_projets_billing_mode_manual;

-- 3. Suppression du check constraint.
ALTER TABLE public.projets
  DROP CONSTRAINT IF EXISTS chk_projets_billing_mode;

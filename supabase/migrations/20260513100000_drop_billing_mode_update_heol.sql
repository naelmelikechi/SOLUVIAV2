-- Migration : taux HEOL passe a 40% + suppression colonne legacy billing_mode.
-- Spec : docs/superpowers/specs/2026-05-12-base-commission-pedago-design.md
--
-- IMPORTANT : a appliquer APRES le deploiement du code qui ne lit plus
-- billing_mode (cleanup PR 3 du chantier base-pedago).

-- 1. UPDATE taux HEOL (50 → 40). Le projet HEOL est identifie par sa ref
--    (0015-HED-APP). Si absent en demo/staging, l'UPDATE est silencieux.
UPDATE public.projets
   SET taux_commission = 40
 WHERE ref = '0015-HED-APP'
   AND taux_commission = 50;

-- 2. Suppression de l'index partiel sur billing_mode='manual'.
DROP INDEX IF EXISTS public.idx_projets_billing_mode_manual;

-- 3. Suppression du check constraint.
ALTER TABLE public.projets
  DROP CONSTRAINT IF EXISTS chk_projets_billing_mode;

-- 4. Suppression de la colonne.
ALTER TABLE public.projets
  DROP COLUMN IF EXISTS billing_mode;

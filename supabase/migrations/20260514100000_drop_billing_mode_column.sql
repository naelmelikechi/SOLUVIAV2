-- Migration : DROP COLUMN public.projets.billing_mode.
-- A appliquer SEULEMENT APRES soak 24-48h du code PR 3 en production, pour
-- limiter le risque d'un rollback qui essaierait encore de lire la colonne.
-- Spec : docs/superpowers/specs/2026-05-12-base-commission-pedago-design.md

ALTER TABLE public.projets
  DROP COLUMN IF EXISTS billing_mode;

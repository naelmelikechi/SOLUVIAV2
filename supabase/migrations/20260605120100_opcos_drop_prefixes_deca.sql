-- Phase "contract" du passage préfixe DECA -> IDCC (voir 20260605120000).
--
-- À APPLIQUER UNIQUEMENT APRÈS le déploiement du code qui résout l'OPCO via
-- IDCC (lib/opco/resolve.ts, lib/queries/opcos.ts, lib/queries/billable-events.ts).
-- Tant que l'ancien code (lecture prefixes_deca) est en ligne, ne pas appliquer :
-- il casserait getActiveOpcoMapping (colonne absente).
--
-- Retire l'ancien modèle département->OPCO devenu mort.

ALTER TABLE opcos DROP CONSTRAINT IF EXISTS opcos_prefixes_format;
DROP INDEX IF EXISTS opcos_prefixes_deca_gin;
ALTER TABLE opcos DROP COLUMN IF EXISTS prefixes_deca;
DROP FUNCTION IF EXISTS public.opcos_check_prefixes(text[]);

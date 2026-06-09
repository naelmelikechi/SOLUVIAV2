-- Reparation drift local/prod : contrats.support et
-- contrats.support_first_equipment existent en prod (sync Eduvia les ecrit,
-- cf. lib/eduvia/sync.ts) mais aucune migration du repo ne les creait. Sans
-- elles, un `gen types --local` supprime silencieusement ces colonnes des
-- types et casse le typecheck. No-op en prod grace a IF NOT EXISTS.

ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS support NUMERIC,
  ADD COLUMN IF NOT EXISTS support_first_equipment NUMERIC;

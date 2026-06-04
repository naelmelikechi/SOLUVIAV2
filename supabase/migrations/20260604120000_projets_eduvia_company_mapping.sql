-- Map Eduvia companies to a specific projet, for clients that span MULTIPLE
-- projets. Until now the Eduvia sync attached every contract of a client to
-- its first non-archived projet (projets[0]), which mis-attributes contracts
-- for multi-projet clients -> wrong CDP visibility (RLS) and wrong commission /
-- echeancier aggregation.
--
-- This column lets an admin declare which Eduvia company_id(s) belong to which
-- projet. The sync resolves contrat.projet_id via this map and only falls back
-- to the first projet when no mapping matches. Single-projet clients keep the
-- exact previous behaviour: the array stays NULL/empty and the fallback wins.

ALTER TABLE projets
  ADD COLUMN IF NOT EXISTS eduvia_company_ids BIGINT[];

COMMENT ON COLUMN projets.eduvia_company_ids IS
  'Eduvia company_id(s) rattachees a ce projet. Utilise par la sync Eduvia pour resoudre contrat.projet_id chez les clients multi-projets. NULL/vide => fallback sur le premier projet.';

-- Membership lookups ("which projet owns company X").
CREATE INDEX IF NOT EXISTS idx_projets_eduvia_company_ids
  ON projets USING GIN (eduvia_company_ids);

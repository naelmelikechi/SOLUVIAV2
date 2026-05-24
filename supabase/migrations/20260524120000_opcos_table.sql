-- Referentiel global des OPCO finançeurs des contrats d'apprentissage.
-- L'OPCO est resolu a la volee depuis le prefixe (3 chars) du contract_number
-- (DECA). Pas de denormalisation sur contrats : si le mapping change, tous les
-- contrats recuperent automatiquement la nouvelle resolution.

CREATE TABLE opcos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL,
  nom             TEXT NOT NULL,
  prefixes_deca   TEXT[] NOT NULL DEFAULT '{}',
  actif           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT opcos_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]*$')
);

-- Verifier que chaque prefixe est sur exactement 3 chiffres. Pas de syntaxe
-- de CHECK array elegante en pg, on passe par une fonction.
CREATE OR REPLACE FUNCTION opcos_check_prefixes(prefixes TEXT[]) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT bool_and(p ~ '^[0-9]{3}$') FROM unnest(prefixes) AS p
$$;

ALTER TABLE opcos ADD CONSTRAINT opcos_prefixes_format
  CHECK (opcos_check_prefixes(prefixes_deca));

CREATE UNIQUE INDEX opcos_code_active_uniq ON opcos (code) WHERE actif;
CREATE INDEX opcos_prefixes_deca_gin ON opcos USING gin (prefixes_deca);

-- updated_at via trigger commun (suppose existant : update_updated_at)
CREATE TRIGGER opcos_updated_at
  BEFORE UPDATE ON opcos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS : SELECT pour tous les authentifies, WRITE admin/superadmin uniquement
ALTER TABLE opcos ENABLE ROW LEVEL SECURITY;

CREATE POLICY opcos_select_authenticated ON opcos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY opcos_write_admin ON opcos
  FOR ALL TO authenticated
  USING (get_user_role() IN ('admin','superadmin'))
  WITH CHECK (get_user_role() IN ('admin','superadmin'));

-- Seed AKTO avec les 6 prefixes confirmes (verifies en prod 2026-05-24)
INSERT INTO opcos (code, nom, prefixes_deca) VALUES (
  'AKTO',
  'AKTO - Commerce, conseil et services',
  ARRAY['017','030','033','050','079','089']
);

COMMENT ON TABLE opcos IS 'Referentiel global OPCO. Resolution via LEFT(contract_number, 3).';

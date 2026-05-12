-- Transformer projets.categorie_interne (TEXT + CHECK 6 valeurs) en table de
-- reference categories_internes pour permettre CRUD admin.

CREATE TABLE IF NOT EXISTS categories_internes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  ordre INT NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  archive BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_internes_actif
  ON categories_internes(actif)
  WHERE actif = true;

INSERT INTO categories_internes (code, libelle, ordre) VALUES
  ('formation',          'Formation interne',  1),
  ('intercontrat',       'Intercontrat',       2),
  ('support_transverse', 'Support transverse', 3),
  ('dev_outils',         'Dev outils',         4),
  ('r_et_d',             'R&D',                5),
  ('prise_de_poste',     'Prise de poste',     6)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE projets
  ADD COLUMN IF NOT EXISTS categorie_interne_id UUID
  REFERENCES categories_internes(id);

UPDATE projets p
SET categorie_interne_id = c.id
FROM categories_internes c
WHERE p.categorie_interne = c.code
  AND p.categorie_interne_id IS NULL;

ALTER TABLE projets DROP CONSTRAINT IF EXISTS chk_categorie_interne_valeurs;
ALTER TABLE projets DROP CONSTRAINT IF EXISTS chk_categorie_interne_coherence;
ALTER TABLE projets DROP COLUMN IF EXISTS categorie_interne;

ALTER TABLE projets ADD CONSTRAINT chk_categorie_interne_coherence CHECK (
  (est_interne = false AND categorie_interne_id IS NULL)
  OR (est_interne = true AND categorie_interne_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_projets_categorie_interne_id
  ON projets(categorie_interne_id)
  WHERE categorie_interne_id IS NOT NULL;

ALTER TABLE categories_internes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cat_internes_select_all ON categories_internes;
CREATE POLICY cat_internes_select_all ON categories_internes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS cat_internes_admin_write ON categories_internes;
CREATE POLICY cat_internes_admin_write ON categories_internes
  FOR ALL TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'superadmin'))
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'superadmin'));

DROP TRIGGER IF EXISTS trg_categories_internes_updated ON categories_internes;
CREATE TRIGGER trg_categories_internes_updated
  BEFORE UPDATE ON categories_internes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Transformer projets.categorie_interne (TEXT + CHECK 6 valeurs) en table de
-- reference categories_internes pour permettre CRUD admin (ajout/renommage
-- de categories sans migration code).
--
-- Pattern : meme approche que typologies_projet.
-- Idempotent partiel (CREATE IF NOT EXISTS sur la table, ON CONFLICT sur seed).

-- 1. Table de reference
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

-- 2. Seed des 6 categories existantes (codes preserves a l'identique)
INSERT INTO categories_internes (code, libelle, ordre) VALUES
  ('formation',          'Formation interne',  1),
  ('intercontrat',       'Intercontrat',       2),
  ('support_transverse', 'Support transverse', 3),
  ('dev_outils',         'Dev outils',         4),
  ('r_et_d',             'R&D',                5),
  ('prise_de_poste',     'Prise de poste',     6)
ON CONFLICT (code) DO NOTHING;

-- 3. Ajout FK sur projets (nullable pendant la migration)
ALTER TABLE projets
  ADD COLUMN IF NOT EXISTS categorie_interne_id UUID
  REFERENCES categories_internes(id);

-- 4. Backfill : recopier l'ancienne valeur TEXT vers la FK
UPDATE projets p
SET categorie_interne_id = c.id
FROM categories_internes c
WHERE p.categorie_interne = c.code
  AND p.categorie_interne_id IS NULL;

-- 5. Drop des anciens CHECK et de la colonne TEXT
ALTER TABLE projets DROP CONSTRAINT IF EXISTS chk_categorie_interne_valeurs;
ALTER TABLE projets DROP CONSTRAINT IF EXISTS chk_categorie_interne_coherence;
ALTER TABLE projets DROP COLUMN IF EXISTS categorie_interne;

-- 6. Nouveau CHECK de coherence sur la FK
ALTER TABLE projets ADD CONSTRAINT chk_categorie_interne_coherence CHECK (
  (est_interne = false AND categorie_interne_id IS NULL)
  OR (est_interne = true AND categorie_interne_id IS NOT NULL)
);

-- 7. Index FK (les FK sans index sont remontees par advisor INFO)
CREATE INDEX IF NOT EXISTS idx_projets_categorie_interne_id
  ON projets(categorie_interne_id)
  WHERE categorie_interne_id IS NOT NULL;

-- 8. RLS
ALTER TABLE categories_internes ENABLE ROW LEVEL SECURITY;

-- Lecture libre pour authenticated (pattern coherent avec projets internes)
DROP POLICY IF EXISTS cat_internes_select_all ON categories_internes;
CREATE POLICY cat_internes_select_all ON categories_internes
  FOR SELECT TO authenticated
  USING (true);

-- Ecriture admin/superadmin uniquement (FOR ALL = INSERT + UPDATE + DELETE)
DROP POLICY IF EXISTS cat_internes_admin_write ON categories_internes;
CREATE POLICY cat_internes_admin_write ON categories_internes
  FOR ALL TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'superadmin'))
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'superadmin'));

-- 9. Trigger updated_at
DROP TRIGGER IF EXISTS trg_categories_internes_updated ON categories_internes;
CREATE TRIGGER trg_categories_internes_updated
  BEFORE UPDATE ON categories_internes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

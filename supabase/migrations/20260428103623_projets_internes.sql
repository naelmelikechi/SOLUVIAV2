-- Projets internes : permettre la saisie de temps non-billable (formation,
-- intercontrat, support transverse, dev outils, R&D, prise de poste) pour
-- les collaborateurs sans projet client. Les saisies vivent dans la meme
-- table saisies_temps mais les projets sont flagges est_interne = true et
-- sont exclus des calculs de production.
--
-- Pattern : projets internes attaches a un client systeme reserve
-- (raison_sociale = 'Interne SOLUVIA') avec une typologie dediee.
-- Tout user actif peut lire et saisir sur ces projets via RLS.

-- 1. Schema : flag et categorie sur projets
ALTER TABLE projets ADD COLUMN est_interne BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projets ADD COLUMN categorie_interne TEXT NULL;

ALTER TABLE projets ADD CONSTRAINT chk_categorie_interne_coherence CHECK (
  (est_interne = false AND categorie_interne IS NULL)
  OR (est_interne = true AND categorie_interne IS NOT NULL)
);

ALTER TABLE projets ADD CONSTRAINT chk_categorie_interne_valeurs CHECK (
  categorie_interne IS NULL
  OR categorie_interne IN (
    'formation',
    'intercontrat',
    'support_transverse',
    'dev_outils',
    'r_et_d',
    'prise_de_poste'
  )
);

CREATE INDEX idx_projets_est_interne ON projets(est_interne) WHERE est_interne = true;

-- 2. Client systeme + typologie dediee pour porter les projets internes
INSERT INTO clients (id, trigramme, raison_sociale, archive)
VALUES (
  '00000000-0000-0000-0000-0000000000ff',
  'INT',
  'Interne SOLUVIA',
  false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO typologies_projet (id, code, libelle, actif)
VALUES (
  '00000000-0000-0000-0000-00000000aaff',
  'INT',
  'Projet interne',
  true
)
ON CONFLICT (id) DO NOTHING;

-- 3. Seed des 6 projets internes (refs explicites pour ne pas consommer
--    seq_projet_ref ; le trigger generate_projet_ref retourne early si ref
--    est deja non null).
INSERT INTO projets (
  ref, client_id, typologie_id, statut, archive,
  est_interne, categorie_interne, taux_commission
)
VALUES
  ('9001-INT-FOR', '00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000aaff', 'actif', false, true, 'formation',          0),
  ('9002-INT-IXC', '00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000aaff', 'actif', false, true, 'intercontrat',       0),
  ('9003-INT-SUP', '00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000aaff', 'actif', false, true, 'support_transverse', 0),
  ('9004-INT-DEV', '00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000aaff', 'actif', false, true, 'dev_outils',         0),
  ('9005-INT-RND', '00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000aaff', 'actif', false, true, 'r_et_d',             0),
  ('9006-INT-PDP', '00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000aaff', 'actif', false, true, 'prise_de_poste',     0)
ON CONFLICT (ref) DO NOTHING;

-- 4. RLS : tout user authentifie peut LIRE les projets internes
--    (necessaire pour la time-grid, en plus de cdp_read_projets existant).
CREATE POLICY users_read_projets_internes ON projets
  FOR SELECT USING (est_interne = true);

-- 5. RLS : tout user authentifie peut SAISIR du temps sur un projet interne
--    (insert/update/delete sur ses propres saisies, peu importe cdp_id).
--    La policy existante cdp_own_saisies couvre deja "user_id = auth.uid()"
--    pour les saisies sur projets dont l user est cdp/backup_cdp ; mais pour
--    les projets internes (cdp_id NULL), il faut une policy explicite.
CREATE POLICY users_write_temps_internes ON saisies_temps
  FOR ALL
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projets p
      WHERE p.id = saisies_temps.projet_id AND p.est_interne = true
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projets p
      WHERE p.id = saisies_temps.projet_id AND p.est_interne = true
    )
  );

-- 6. RLS sur saisies_temps_axes : meme logique pour le breakdown des heures
CREATE POLICY users_write_axes_internes ON saisies_temps_axes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM saisies_temps st
      JOIN projets p ON p.id = st.projet_id
      WHERE st.id = saisies_temps_axes.saisie_id
        AND st.user_id = auth.uid()
        AND p.est_interne = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM saisies_temps st
      JOIN projets p ON p.id = st.projet_id
      WHERE st.id = saisie_id
        AND st.user_id = auth.uid()
        AND p.est_interne = true
    )
  );

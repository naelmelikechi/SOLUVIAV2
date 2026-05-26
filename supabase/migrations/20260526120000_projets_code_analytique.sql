-- Migration : ajoute projets.code_analytique pour synergie #1 (push analytique
-- automatique vers Odoo à chaque facture postée).
--
-- Le code analytique est l'identifiant du compte analytique Odoo (champ
-- `code` de `account.analytic.account`). FINANCES-WISEMANH aligne sur la
-- même nomenclature N3 (ex : 41.01 = SOLUVIA, 42.01 = Eduvia).
--
-- NULL = pas de push analytique pour ce projet (comportement actuel). Le
-- remplissage est progressif : tant qu'aucun code n'est saisi, la synergie
-- est inactive (zero régression).

ALTER TABLE projets
  ADD COLUMN IF NOT EXISTS code_analytique TEXT NULL;

COMMENT ON COLUMN projets.code_analytique IS
  'Code du compte analytique Odoo (account.analytic.account.code). NULL = pas de ventilation analytique poussée vers Odoo.';

-- Index partiel pour lookups rapides côté push facture (seul un sous-ensemble
-- des projets aura ce champ rempli).
CREATE INDEX IF NOT EXISTS idx_projets_code_analytique
  ON projets(code_analytique)
  WHERE code_analytique IS NOT NULL;

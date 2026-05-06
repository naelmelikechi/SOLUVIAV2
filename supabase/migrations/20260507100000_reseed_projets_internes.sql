-- Re-seed projets internes : le client systeme "Interne SOLUVIA" et les 6
-- projets internes (formation, intercontrat, support_transverse, dev_outils,
-- r_et_d, prise_de_poste) ont ete supprimes manuellement de la base prod
-- apres l'application initiale de 20260428103623_projets_internes.
--
-- Sans ces lignes, /temps est vide pour tout user n'ayant aucun projet
-- client assigne (la grille n'a plus aucune ligne de saisie).
--
-- Idempotent : ON CONFLICT DO NOTHING sur (id) pour clients/typologies et
-- (ref) pour projets, on ne re-genere pas les UUID existants.

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

-- Rattachement des apprenants Eduvia a un projet SOLUVIA.
--
-- Jusqu'ici `apprenants` ne portait que `source_client_id` : un apprenant sans
-- contrat (fiche creee dans Eduvia mais contrat pas encore etabli) n'etait donc
-- rattachable a aucun projet, et restait invisible dans l'app. C'est pourtant
-- exactement la population a surveiller : 7 cas en prod au 2026-08-05.
--
-- On stocke la company Eduvia d'origine + le projet resolu au sync, avec la
-- meme regle que les contrats (buildProjetResolution : mapping par company,
-- repli sur le projet unique du client quand la company est inconnue ou nulle).

ALTER TABLE apprenants
  ADD COLUMN IF NOT EXISTS eduvia_company_id INTEGER,
  ADD COLUMN IF NOT EXISTS projet_id UUID REFERENCES projets(id);

CREATE INDEX IF NOT EXISTS idx_apprenants_projet ON apprenants(projet_id);

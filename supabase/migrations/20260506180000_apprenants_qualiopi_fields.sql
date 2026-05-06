-- Enrichit apprenants avec les champs Qualiopi+identite supplementaires
-- exposes par l'API Eduvia /employees (mais qu'on n'avait pas encore stockes).
--
-- Utile pour Qualiopi indicateur 14 (handicap) + analyse demographique.

ALTER TABLE apprenants
  ADD COLUMN birth_date DATE,
  ADD COLUMN address TEXT,
  ADD COLUMN postcode TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN nationality_code INTEGER,
  ADD COLUMN disabled_worker BOOLEAN,
  ADD COLUMN status TEXT;

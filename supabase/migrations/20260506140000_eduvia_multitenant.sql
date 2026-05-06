-- Multi-tenancy fix : les tables Eduvia avaient UNIQUE (eduvia_id) global.
-- Quand 2 CFA exposent des IDs dans la meme plage (ex DEMO+HEOL en 1-58),
-- le sync ecrase silencieusement les rows du precedent CFA.
-- Discriminator = source_client_id (FK clients) + UNIQUE composite.

-- 1. Ajout colonne source_client_id sur les 5 tables qui n'en ont pas
ALTER TABLE contrats ADD COLUMN source_client_id UUID REFERENCES clients(id);
ALTER TABLE apprenants ADD COLUMN source_client_id UUID REFERENCES clients(id);
ALTER TABLE formations ADD COLUMN source_client_id UUID REFERENCES clients(id);
ALTER TABLE eduvia_invoice_steps ADD COLUMN source_client_id UUID REFERENCES clients(id);
ALTER TABLE eduvia_invoice_forecast_steps ADD COLUMN source_client_id UUID REFERENCES clients(id);
-- eduvia_companies a deja un client_id, on le reutilise

-- 2. Backfill depuis relations existantes
UPDATE contrats c SET source_client_id = p.client_id
FROM projets p WHERE c.projet_id = p.id;

UPDATE apprenants a SET source_client_id = (
  SELECT p.client_id
  FROM contrats c JOIN projets p ON p.id = c.projet_id
  WHERE c.eduvia_employee_id = a.eduvia_id
  LIMIT 1
);

UPDATE formations f SET source_client_id = (
  SELECT p.client_id
  FROM contrats c JOIN projets p ON p.id = c.projet_id
  WHERE c.eduvia_formation_id = f.eduvia_id
  LIMIT 1
);

UPDATE eduvia_invoice_steps s SET source_client_id = (
  SELECT p.client_id FROM contrats c JOIN projets p ON p.id = c.projet_id
  WHERE c.id = s.contrat_id LIMIT 1
);

UPDATE eduvia_invoice_forecast_steps s SET source_client_id = (
  SELECT p.client_id FROM contrats c JOIN projets p ON p.id = c.projet_id
  WHERE c.id = s.contrat_id LIMIT 1
);

-- 3. Remplace UNIQUE (eduvia_id) par UNIQUE (eduvia_id, source_client_id)
ALTER TABLE contrats DROP CONSTRAINT contrats_eduvia_id_key;
ALTER TABLE contrats ADD CONSTRAINT contrats_eduvia_id_source_key
  UNIQUE (eduvia_id, source_client_id);

ALTER TABLE apprenants DROP CONSTRAINT apprenants_eduvia_id_key;
ALTER TABLE apprenants ADD CONSTRAINT apprenants_eduvia_id_source_key
  UNIQUE (eduvia_id, source_client_id);

ALTER TABLE formations DROP CONSTRAINT formations_eduvia_id_key;
ALTER TABLE formations ADD CONSTRAINT formations_eduvia_id_source_key
  UNIQUE (eduvia_id, source_client_id);

ALTER TABLE eduvia_companies DROP CONSTRAINT eduvia_companies_eduvia_id_key;
ALTER TABLE eduvia_companies ADD CONSTRAINT eduvia_companies_eduvia_id_client_key
  UNIQUE (eduvia_id, client_id);

ALTER TABLE eduvia_invoice_steps DROP CONSTRAINT eduvia_invoice_steps_eduvia_id_key;
ALTER TABLE eduvia_invoice_steps ADD CONSTRAINT eduvia_invoice_steps_eduvia_id_source_key
  UNIQUE (eduvia_id, source_client_id);

ALTER TABLE eduvia_invoice_forecast_steps DROP CONSTRAINT eduvia_invoice_forecast_steps_eduvia_id_key;
ALTER TABLE eduvia_invoice_forecast_steps ADD CONSTRAINT eduvia_invoice_forecast_steps_eduvia_id_source_key
  UNIQUE (eduvia_id, source_client_id);

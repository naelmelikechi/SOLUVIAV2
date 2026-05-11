-- Multi-tenancy fix : bascule UNIQUE (eduvia_id) -> UNIQUE (eduvia_id, source_client_id).
--
-- Partie 2/2 : suite de la migration add_source_client. On peut maintenant
-- drop les anciennes contraintes UNIQUE et ajouter les composite, le
-- backfill ayant ete fait dans la migration precedente.

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

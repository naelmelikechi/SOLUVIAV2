-- Corrige l'index unique sur paiements.odoo_id : la version partielle
-- (WHERE odoo_id IS NOT NULL) n'est PAS inferable par l'upsert PostgREST.
--
-- PostgREST emet `ON CONFLICT (odoo_id)` sans predicat ; Postgres refuse
-- d'inferer un index unique partiel sans que le WHERE soit repete -> erreur
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Un index unique NON partiel convient : en Postgres les NULL sont distincts
-- par defaut (NULLS DISTINCT), donc plusieurs paiements sans odoo_id restent
-- autorises, tout en garantissant l'unicite des odoo_id non nuls.

DROP INDEX IF EXISTS uq_paiements_odoo_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_paiements_odoo_id
  ON paiements (odoo_id);

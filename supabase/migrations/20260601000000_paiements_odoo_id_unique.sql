-- Index unique partiel sur paiements.odoo_id
--
-- Contexte : le cron de pull Odoo (lib/odoo/sync.ts) et "Marquer payee"
-- (lib/actions/factures/payments.ts) reposent sur une deduplication par
-- `odoo_id` (upsert onConflict:'odoo_id'). Or aucune contrainte unique
-- n'existait sur cette colonne -> l'upsert aurait echoue des qu'un paiement
-- aurait reellement ete ramene. Le bug etait latent car account.payment cote
-- Odoo etait vide (les virements HEOL etaient reconcilies au niveau releve
-- bancaire, sans creer d'account.payment).
--
-- Partiel WHERE odoo_id IS NOT NULL : les paiements saisis sans odoo_id
-- (cas legacy / manuel hors Odoo) restent autorises en multiple.

CREATE UNIQUE INDEX IF NOT EXISTS uq_paiements_odoo_id
  ON paiements (odoo_id)
  WHERE odoo_id IS NOT NULL;

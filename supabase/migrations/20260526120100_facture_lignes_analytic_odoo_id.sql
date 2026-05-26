-- Migration : ajoute facture_lignes.analytic_line_odoo_id pour synergie #1.
-- Tracé local de l'account.analytic.line créée côté Odoo lors du push facture.
-- Permet l'idempotence : si le sync re-tourne, on skip les lignes déjà poussées.

ALTER TABLE facture_lignes
  ADD COLUMN IF NOT EXISTS analytic_line_odoo_id TEXT NULL;

COMMENT ON COLUMN facture_lignes.analytic_line_odoo_id IS
  'ID Odoo (account.analytic.line) crée par le push analytique automatique. NULL = pas encore poussée OU projet.code_analytique manquant.';

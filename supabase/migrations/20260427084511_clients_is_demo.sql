-- Mode demo : un client tagge is_demo permet de tester le flow facture
-- (PDF, email Resend, push Odoo) sans polluer les livres comptables.
--
-- Cote sync Odoo, les factures de clients demo sont creees en draft
-- (pas d action_post), donc invisibles dans le P&L / TVA collectee.

ALTER TABLE clients
  ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_clients_is_demo ON clients (is_demo) WHERE is_demo = true;

COMMENT ON COLUMN clients.is_demo IS
  'Client de test/demo. Les factures associees sont poussees en draft cote Odoo et n entrent pas dans les livres.';

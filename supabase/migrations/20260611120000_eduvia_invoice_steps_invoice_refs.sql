-- Traçabilité Eduvia sur les bordereaux OPCO : numéro de facture Eduvia
-- (invoice_number, ~100% renseigné) et référence externe OPCO (external_number,
-- ~72% des factures REGLE). Renseignés par la sync depuis
-- GET /api/v1/contracts/:id/invoices (endpoint documenté, OpenAPI v1.0.0).
--
-- Nullable : Eduvia ne fournit pas toujours external_number, et un step non
-- émis (eduvia_invoice_id NULL) n'a pas de facture associée. Pas d'index :
-- ces colonnes servent l'affichage/traçabilité, pas le filtrage.
ALTER TABLE public.eduvia_invoice_steps
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS external_number TEXT;

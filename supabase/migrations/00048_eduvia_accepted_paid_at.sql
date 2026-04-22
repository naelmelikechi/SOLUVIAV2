-- 00048_eduvia_accepted_paid_at.sql
-- Surface two new Eduvia timestamps that issue #93 added upstream:
--   - contrats.accepted_at : when the contract was accepted (signed/validated)
--   - eduvia_invoice_steps.paid_at : when the OPCO actually paid the step
-- Both are nullable because historical rows won't have them until the
-- next sync pass repopulates from the API.

ALTER TABLE contrats
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE eduvia_invoice_steps
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

COMMENT ON COLUMN contrats.accepted_at IS 'Contract acceptance timestamp from Eduvia (signed/validated state)';
COMMENT ON COLUMN eduvia_invoice_steps.paid_at IS 'Invoice step payment timestamp from Eduvia OPCO flow';

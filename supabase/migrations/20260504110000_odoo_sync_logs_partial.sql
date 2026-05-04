-- Add 'partial' to odoo_sync_logs.statut CHECK to distinguish runs where
-- some entities succeeded and others errored. This unblocks the pull `since`
-- logic in lib/odoo/sync.ts which now treats partial as a valid checkpoint.

ALTER TABLE odoo_sync_logs DROP CONSTRAINT IF EXISTS odoo_sync_logs_statut_check;
ALTER TABLE odoo_sync_logs
  ADD CONSTRAINT odoo_sync_logs_statut_check
  CHECK (statut IN ('success', 'error', 'retry', 'partial'));

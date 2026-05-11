-- Indexes created_at DESC pour les tables historiques : pages admin
-- font systematiquement .order('created_at', { ascending: false }) avec
-- pagination. Sans index dedie, Postgres fait un seq scan + sort - O(n)
-- a chaque page. A 100k+ rows la latence devient visible.
--
-- email_send_log a deja un index sur sent_at DESC (cf 00058).
-- IF NOT EXISTS pour idempotence si deja deploye manuellement.

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc
  ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_odoo_sync_logs_created_at_desc
  ON odoo_sync_logs (created_at DESC);

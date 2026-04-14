CREATE TABLE IF NOT EXISTS odoo_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  statut TEXT NOT NULL CHECK (statut IN ('success', 'error', 'retry')),
  payload JSONB,
  erreur TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE odoo_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_odoo_sync_logs" ON odoo_sync_logs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

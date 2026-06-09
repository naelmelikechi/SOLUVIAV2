-- eduvia_sync_logs : journal persistant des runs de sync Eduvia (1 ligne par
-- client et par run). Analogue de odoo_sync_logs : permet de repondre a
-- "la sync de ce client echoue depuis N jours" en DB, sans dependre de Sentry.

CREATE TABLE IF NOT EXISTS public.eduvia_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  statut TEXT NOT NULL CHECK (statut IN ('success', 'partial', 'error')),
  -- Compteurs du run (contrats, apprenants, ...) : shape = SyncClientResult.
  stats JSONB,
  erreur TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK indexee (advisor unindexed_foreign_keys) + acces "derniers runs du client".
CREATE INDEX IF NOT EXISTS idx_eduvia_sync_logs_client_created
  ON public.eduvia_sync_logs (client_id, created_at DESC);

ALTER TABLE public.eduvia_sync_logs ENABLE ROW LEVEL SECURITY;

-- Lecture admin/superadmin uniquement. Les ecritures passent par le client
-- service-role (cron + action manuelle) et bypassent la RLS : pas de policy
-- INSERT/UPDATE/DELETE pour authenticated.
CREATE POLICY eduvia_sync_logs_select ON public.eduvia_sync_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

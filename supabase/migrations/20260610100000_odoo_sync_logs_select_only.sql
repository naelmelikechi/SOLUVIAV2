-- odoo_sync_logs : restreindre la RLS a la lecture seule, sur le modele
-- d'eduvia_sync_logs (20260610090000).
--
-- La policy admin_all_odoo_sync_logs etait FOR ALL TO authenticated, alors
-- que toutes les ecritures passent par le client service-role qui bypasse la
-- RLS : logSync() dans lib/odoo/sync.ts est le seul writer, et syncOdoo()
-- recoit toujours createAdminClient() (app/api/sync/odoo/route.ts cote cron,
-- lib/actions/sync.ts cote action manuelle). Aucun client authenticated n'a
-- donc besoin d'INSERT/UPDATE/DELETE sur cette table : on ne garde que la
-- lecture admin/superadmin.

DROP POLICY IF EXISTS "admin_all_odoo_sync_logs" ON public.odoo_sync_logs;

CREATE POLICY odoo_sync_logs_select ON public.odoo_sync_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

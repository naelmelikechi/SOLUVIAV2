-- Optimise les RLS policies notifications : wrap auth.uid() et is_admin()
-- dans un (SELECT ...) pour que PostgreSQL evalue ces fonctions UNE seule fois
-- par query (InitPlan) au lieu d une fois par ligne.
--
-- Recommandation officielle Supabase : https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
-- Sur les tables high-traffic comme notifications (Realtime sub + chaque
-- page load), le gain peut etre x10+ sur les SELECT large.
--
-- POC sur notifications avant de generaliser aux 42 policies flagees.

DROP POLICY IF EXISTS admin_all_notifications ON public.notifications;
DROP POLICY IF EXISTS cdp_read_notifications ON public.notifications;
DROP POLICY IF EXISTS cdp_update_notifications ON public.notifications;

CREATE POLICY admin_all_notifications ON public.notifications
  FOR ALL
  USING ((SELECT is_admin()));

CREATE POLICY cdp_read_notifications ON public.notifications
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY cdp_update_notifications ON public.notifications
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

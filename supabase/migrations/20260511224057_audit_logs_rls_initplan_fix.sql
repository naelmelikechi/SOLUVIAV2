
DROP POLICY IF EXISTS admin_select_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS admin_insert_audit_logs ON public.audit_logs;

CREATE POLICY admin_select_audit_logs ON public.audit_logs
  FOR SELECT
  USING ((SELECT public.get_user_role()) IN ('admin', 'superadmin'));

CREATE POLICY admin_insert_audit_logs ON public.audit_logs
  FOR INSERT
  WITH CHECK ((SELECT public.get_user_role()) IN ('admin', 'superadmin'));

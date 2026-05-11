-- Resout les warnings auth_rls_initplan (advisor 0003) sur public.audit_logs.
-- Avant : EXISTS(SELECT FROM users WHERE id = auth.uid()...) reevaluait
-- auth.uid() pour chaque row.
-- Apres : (SELECT get_user_role()) IN (...) - get_user_role() est STABLE
-- + le wrap (SELECT ...) force Postgres a evaluer une seule fois par query.
-- Coherent avec [[feedback_rls_admin_roles]] : prefer get_user_role().

DROP POLICY IF EXISTS admin_select_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS admin_insert_audit_logs ON public.audit_logs;

CREATE POLICY admin_select_audit_logs ON public.audit_logs
  FOR SELECT
  USING ((SELECT public.get_user_role()) IN ('admin', 'superadmin'));

CREATE POLICY admin_insert_audit_logs ON public.audit_logs
  FOR INSERT
  WITH CHECK ((SELECT public.get_user_role()) IN ('admin', 'superadmin'));

-- Fix RLS policies that filter role = 'admin' strict, missing superadmin.
--
-- Two policies were created BEFORE the superadmin role was introduced
-- (migration 00037_superadmin_role.sql) and were never updated. They use
-- inline role checks instead of the is_admin() helper, so they silently
-- exclude superadmin users.
--
-- 1. odoo_sync_logs : superadmin could not read sync logs.
-- 2. absences (admin SELECT policy) : superadmin saw only their own absences.
--
-- Fix: drop and recreate using the is_admin() helper, which already
-- returns true for both 'admin' and 'superadmin' (cf. 00037).

DROP POLICY IF EXISTS "admin_all_odoo_sync_logs" ON odoo_sync_logs;

CREATE POLICY "admin_all_odoo_sync_logs" ON odoo_sync_logs
  FOR ALL TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "absences_select_admin" ON absences;

CREATE POLICY "absences_select_admin" ON absences
  FOR SELECT
  USING (is_admin());

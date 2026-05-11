-- RLS bug_reports : autoriser superadmin en plus de admin (parite avec
-- isAdmin() cote app qui accepte les deux roles).

DROP POLICY IF EXISTS bug_reports_select_admin ON bug_reports;
DROP POLICY IF EXISTS bug_reports_update_admin ON bug_reports;

CREATE POLICY bug_reports_select_admin
ON bug_reports FOR SELECT
TO authenticated
USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY bug_reports_update_admin
ON bug_reports FOR UPDATE
TO authenticated
USING (get_user_role() IN ('admin','superadmin'))
WITH CHECK (get_user_role() IN ('admin','superadmin'));

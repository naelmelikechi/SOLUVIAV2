-- Audit logs : append-only.
--
-- Avant : la policy `admin_all_audit_logs FOR ALL` autorisait DELETE par
-- les admins, ce qui rendait possible la suppression de traces (un admin
-- compromis peut effacer l'evidence). Audit externe 2026-05-07 P1.
--
-- On separe en SELECT/INSERT/UPDATE explicites et on ajoute une policy
-- FOR DELETE qui interdit la suppression a tout le monde, y compris les
-- admins. Pour une purge legitime (ex: RGPD oubli), passer par une
-- migration explicite, pas par la couche RLS.

DROP POLICY IF EXISTS "admin_all_audit_logs" ON audit_logs;

CREATE POLICY "admin_select_audit_logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admin_insert_audit_logs" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- Pas de UPDATE (un audit log immuable une fois ecrit).
-- Pas de DELETE : la policy suivante ferme explicitement la voie.
CREATE POLICY "audit_logs_no_delete" ON audit_logs
  FOR DELETE TO authenticated
  USING (false);

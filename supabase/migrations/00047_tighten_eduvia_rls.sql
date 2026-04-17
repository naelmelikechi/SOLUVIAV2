-- 00047_tighten_eduvia_rls.sql
-- Re-write RLS on contrats_progressions, eduvia_invoice_steps and
-- eduvia_invoice_forecast_steps to use the explicit admin / cdp
-- permission check pattern from 00030_rls_policies.sql, instead of
-- relying on nested `contrat_id IN (SELECT id FROM contrats)` which
-- only happens to work because Postgres runs the subquery with RLS.
--
-- Pattern mirrors the `facture_lignes` SELECT policy in 00030:
-- two-hop EXISTS through contrats -> projets, gated by is_admin() OR
-- projet cdp_id/backup_cdp_id. is_admin() already handles both 'admin'
-- and 'superadmin' (see 00037_superadmin_role.sql).

-- ── contrats_progressions ─────────────────────────────────────────────
DROP POLICY IF EXISTS contrats_progressions_select ON contrats_progressions;
DROP POLICY IF EXISTS contrats_progressions_admin_all ON contrats_progressions;

CREATE POLICY contrats_progressions_admin_all ON contrats_progressions
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY contrats_progressions_select ON contrats_progressions
  FOR SELECT TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM contrats c
      JOIN projets p ON p.id = c.projet_id
      WHERE c.id = contrats_progressions.contrat_id
        AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
    )
  );

-- ── eduvia_invoice_steps ──────────────────────────────────────────────
DROP POLICY IF EXISTS eduvia_invoice_steps_select ON eduvia_invoice_steps;
DROP POLICY IF EXISTS eduvia_invoice_steps_admin_all ON eduvia_invoice_steps;

CREATE POLICY eduvia_invoice_steps_admin_all ON eduvia_invoice_steps
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY eduvia_invoice_steps_select ON eduvia_invoice_steps
  FOR SELECT TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM contrats c
      JOIN projets p ON p.id = c.projet_id
      WHERE c.id = eduvia_invoice_steps.contrat_id
        AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
    )
  );

-- ── eduvia_invoice_forecast_steps ─────────────────────────────────────
DROP POLICY IF EXISTS eduvia_invoice_forecast_steps_select ON eduvia_invoice_forecast_steps;
DROP POLICY IF EXISTS eduvia_invoice_forecast_steps_admin_all ON eduvia_invoice_forecast_steps;

CREATE POLICY eduvia_invoice_forecast_steps_admin_all ON eduvia_invoice_forecast_steps
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY eduvia_invoice_forecast_steps_select ON eduvia_invoice_forecast_steps
  FOR SELECT TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM contrats c
      JOIN projets p ON p.id = c.projet_id
      WHERE c.id = eduvia_invoice_forecast_steps.contrat_id
        AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
    )
  );

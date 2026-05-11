-- Wrap auth.uid() dans (SELECT auth.uid()) sur les 40 RLS policies flagees
-- par le Supabase advisor (lint 0003_auth_rls_initplan).
--
-- PostgreSQL evalue alors auth.uid() UNE seule fois par query (InitPlan)
-- au lieu d une fois par ligne. Gain perf proportionnel a la cardinalite.
-- POC valide sur notifications (commit ddae84d).
--
-- Aucun changement fonctionnel : les conditions restent semantiquement
-- identiques, on ne change que le moment d evaluation.

-- 1. audit_logs
DROP POLICY IF EXISTS admin_all_audit_logs ON public.audit_logs;
CREATE POLICY admin_all_audit_logs ON public.audit_logs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (SELECT auth.uid())
      AND users.role = ANY (ARRAY['admin'::role_utilisateur, 'superadmin'::role_utilisateur])
  ));

-- 2-4. projet_documents (3 policies)
DROP POLICY IF EXISTS cdp_read_projet_documents ON public.projet_documents;
CREATE POLICY cdp_read_projet_documents ON public.projet_documents
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = projet_documents.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

DROP POLICY IF EXISTS cdp_insert_projet_documents ON public.projet_documents;
CREATE POLICY cdp_insert_projet_documents ON public.projet_documents
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM projets p
      WHERE p.id = projet_documents.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS cdp_delete_projet_documents ON public.projet_documents;
CREATE POLICY cdp_delete_projet_documents ON public.projet_documents
  FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM projets p
      WHERE p.id = projet_documents.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  );

-- 5. prospect_notes
DROP POLICY IF EXISTS pipeline_insert_prospect_notes ON public.prospect_notes;
CREATE POLICY pipeline_insert_prospect_notes ON public.prospect_notes
  FOR INSERT
  WITH CHECK (has_pipeline_access() AND user_id = (SELECT auth.uid()));

-- 6-8. team_messages
DROP POLICY IF EXISTS team_messages_select ON public.team_messages;
CREATE POLICY team_messages_select ON public.team_messages
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS team_messages_insert ON public.team_messages;
CREATE POLICY team_messages_insert ON public.team_messages
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS team_messages_delete ON public.team_messages;
CREATE POLICY team_messages_delete ON public.team_messages
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- 9-10. idees
DROP POLICY IF EXISTS auth_propose_idees ON public.idees;
CREATE POLICY auth_propose_idees ON public.idees
  FOR INSERT TO authenticated
  WITH CHECK (auteur_id = (SELECT auth.uid()) AND statut = 'proposee'::statut_idee);

DROP POLICY IF EXISTS author_edit_own_proposed ON public.idees;
CREATE POLICY author_edit_own_proposed ON public.idees
  FOR UPDATE TO authenticated
  USING (auteur_id = (SELECT auth.uid()) AND statut = 'proposee'::statut_idee);

-- 11. contrats_progressions
DROP POLICY IF EXISTS contrats_progressions_select ON public.contrats_progressions;
CREATE POLICY contrats_progressions_select ON public.contrats_progressions
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM contrats c JOIN projets p ON p.id = c.projet_id
      WHERE c.id = contrats_progressions.contrat_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  );

-- 12. eduvia_invoice_steps
DROP POLICY IF EXISTS eduvia_invoice_steps_select ON public.eduvia_invoice_steps;
CREATE POLICY eduvia_invoice_steps_select ON public.eduvia_invoice_steps
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM contrats c JOIN projets p ON p.id = c.projet_id
      WHERE c.id = eduvia_invoice_steps.contrat_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  );

-- 13. eduvia_invoice_forecast_steps
DROP POLICY IF EXISTS eduvia_invoice_forecast_steps_select ON public.eduvia_invoice_forecast_steps;
CREATE POLICY eduvia_invoice_forecast_steps_select ON public.eduvia_invoice_forecast_steps
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM contrats c JOIN projets p ON p.id = c.projet_id
      WHERE c.id = eduvia_invoice_forecast_steps.contrat_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  );

-- 14-15. rdv_formateurs
DROP POLICY IF EXISTS cdp_read_rdv_formateurs ON public.rdv_formateurs;
CREATE POLICY cdp_read_rdv_formateurs ON public.rdv_formateurs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = rdv_formateurs.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

DROP POLICY IF EXISTS cdp_write_rdv_formateurs ON public.rdv_formateurs;
CREATE POLICY cdp_write_rdv_formateurs ON public.rdv_formateurs
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = rdv_formateurs.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = rdv_formateurs.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

-- 16. rdv_commerciaux
DROP POLICY IF EXISTS pipeline_write_rdv_commerciaux ON public.rdv_commerciaux;
CREATE POLICY pipeline_write_rdv_commerciaux ON public.rdv_commerciaux
  FOR ALL
  USING (has_pipeline_access())
  WITH CHECK (has_pipeline_access() AND commercial_id = (SELECT auth.uid()));

-- 17. progression_snapshots_weekly
DROP POLICY IF EXISTS cdp_read_progression_snapshots ON public.progression_snapshots_weekly;
CREATE POLICY cdp_read_progression_snapshots ON public.progression_snapshots_weekly
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM contrats c JOIN projets p ON p.id = c.projet_id
    WHERE c.id = progression_snapshots_weekly.contrat_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

-- 18-19. client_notes / client_documents inserts
DROP POLICY IF EXISTS cdp_insert_client_notes ON public.client_notes;
CREATE POLICY cdp_insert_client_notes ON public.client_notes
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS cdp_insert_client_documents ON public.client_documents;
CREATE POLICY cdp_insert_client_documents ON public.client_documents
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 20. projets
DROP POLICY IF EXISTS cdp_read_projets ON public.projets;
CREATE POLICY cdp_read_projets ON public.projets
  FOR SELECT
  USING (cdp_id = (SELECT auth.uid()) OR backup_cdp_id = (SELECT auth.uid()));

-- 21. contrats
DROP POLICY IF EXISTS cdp_read_contrats ON public.contrats;
CREATE POLICY cdp_read_contrats ON public.contrats
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = contrats.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

-- 22. saisies_temps.cdp_own_saisies
DROP POLICY IF EXISTS cdp_own_saisies ON public.saisies_temps;
CREATE POLICY cdp_own_saisies ON public.saisies_temps
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 23. saisies_temps_axes.cdp_own_axes
DROP POLICY IF EXISTS cdp_own_axes ON public.saisies_temps_axes;
CREATE POLICY cdp_own_axes ON public.saisies_temps_axes
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM saisies_temps st
    WHERE st.id = saisies_temps_axes.saisie_id
      AND st.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM saisies_temps st
    WHERE st.id = saisies_temps_axes.saisie_id
      AND st.user_id = (SELECT auth.uid())
  ));

-- 24. production_mensuelle
DROP POLICY IF EXISTS cdp_read_production ON public.production_mensuelle;
CREATE POLICY cdp_read_production ON public.production_mensuelle
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = production_mensuelle.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

-- 25. donnees_financieres
DROP POLICY IF EXISTS cdp_read_donnees_fin ON public.donnees_financieres;
CREATE POLICY cdp_read_donnees_fin ON public.donnees_financieres
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = donnees_financieres.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

-- 26-27. factures (cdp_read, cdp_insert)
DROP POLICY IF EXISTS cdp_read_factures ON public.factures;
CREATE POLICY cdp_read_factures ON public.factures
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = factures.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

DROP POLICY IF EXISTS cdp_insert_factures ON public.factures;
CREATE POLICY cdp_insert_factures ON public.factures
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = factures.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

-- 28. facture_lignes
DROP POLICY IF EXISTS cdp_read_facture_lignes ON public.facture_lignes;
CREATE POLICY cdp_read_facture_lignes ON public.facture_lignes
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM factures f JOIN projets p ON f.projet_id = p.id
    WHERE f.id = facture_lignes.facture_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

-- 29. paiements
DROP POLICY IF EXISTS cdp_read_paiements ON public.paiements;
CREATE POLICY cdp_read_paiements ON public.paiements
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM factures f JOIN projets p ON f.projet_id = p.id
    WHERE f.id = paiements.facture_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

-- 30. echeances
DROP POLICY IF EXISTS cdp_read_echeances ON public.echeances;
CREATE POLICY cdp_read_echeances ON public.echeances
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = echeances.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ));

-- 31. kpi_snapshots
DROP POLICY IF EXISTS cdp_read_snapshots ON public.kpi_snapshots;
CREATE POLICY cdp_read_snapshots ON public.kpi_snapshots
  FOR SELECT
  USING (
    scope = 'global'::scope_kpi
    OR (scope = 'cdp'::scope_kpi AND scope_id = (SELECT auth.uid()))
    OR (
      scope = 'projet'::scope_kpi
      AND EXISTS (
        SELECT 1 FROM projets p
        WHERE p.id = kpi_snapshots.scope_id
          AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
      )
    )
  );

-- 32-33. absences
DROP POLICY IF EXISTS absences_select_own ON public.absences;
CREATE POLICY absences_select_own ON public.absences
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS absences_modify_own ON public.absences;
CREATE POLICY absences_modify_own ON public.absences
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 34-35. webauthn_credentials
DROP POLICY IF EXISTS users_select_own_credentials ON public.webauthn_credentials;
CREATE POLICY users_select_own_credentials ON public.webauthn_credentials
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS users_delete_own_credentials ON public.webauthn_credentials;
CREATE POLICY users_delete_own_credentials ON public.webauthn_credentials
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- 36. saisies_temps.users_write_temps_internes
DROP POLICY IF EXISTS users_write_temps_internes ON public.saisies_temps;
CREATE POLICY users_write_temps_internes ON public.saisies_temps
  FOR ALL
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM projets p
      WHERE p.id = saisies_temps.projet_id AND p.est_interne = true
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM projets p
      WHERE p.id = saisies_temps.projet_id AND p.est_interne = true
    )
  );

-- 37. saisies_temps_axes.users_write_axes_internes
DROP POLICY IF EXISTS users_write_axes_internes ON public.saisies_temps_axes;
CREATE POLICY users_write_axes_internes ON public.saisies_temps_axes
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM saisies_temps st JOIN projets p ON p.id = st.projet_id
    WHERE st.id = saisies_temps_axes.saisie_id
      AND st.user_id = (SELECT auth.uid())
      AND p.est_interne = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM saisies_temps st JOIN projets p ON p.id = st.projet_id
    WHERE st.id = saisies_temps_axes.saisie_id
      AND st.user_id = (SELECT auth.uid())
      AND p.est_interne = true
  ));

-- 38. qualite_assignments
DROP POLICY IF EXISTS cdp_select_qualite_assignments ON public.qualite_assignments;
CREATE POLICY cdp_select_qualite_assignments ON public.qualite_assignments
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.client_id = qualite_assignments.client_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
      AND p.archive = false
  ));

-- 39. facturation_ajustements_pending
DROP POLICY IF EXISTS cdp_select_ajustements_pending ON public.facturation_ajustements_pending;
CREATE POLICY cdp_select_ajustements_pending ON public.facturation_ajustements_pending
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p
    WHERE p.id = facturation_ajustements_pending.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
      AND p.archive = false
  ));

-- 40. bug_reports.bug_reports_insert_own
DROP POLICY IF EXISTS bug_reports_insert_own ON public.bug_reports;
CREATE POLICY bug_reports_insert_own ON public.bug_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

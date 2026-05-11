-- Lot 3 : consolidation des 23 tables restantes avec pattern admin_all_X
-- (ALL is_admin) + cdp_read/pipeline_read/etc. Resultat combine avec lot 2 :
-- multiple_permissive_policies 311 -> 0.

-- apprenants
DROP POLICY IF EXISTS admin_all_apprenants ON public.apprenants;
DROP POLICY IF EXISTS cdp_read_apprenants ON public.apprenants;
CREATE POLICY apprenants_select ON public.apprenants FOR SELECT USING (true);
CREATE POLICY apprenants_insert ON public.apprenants FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY apprenants_update ON public.apprenants FOR UPDATE USING (public.is_admin());
CREATE POLICY apprenants_delete ON public.apprenants FOR DELETE USING (public.is_admin());

-- client_contacts
DROP POLICY IF EXISTS admin_all_client_contacts ON public.client_contacts;
DROP POLICY IF EXISTS cdp_read_client_contacts ON public.client_contacts;
CREATE POLICY client_contacts_select ON public.client_contacts FOR SELECT USING (true);
CREATE POLICY client_contacts_insert ON public.client_contacts FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY client_contacts_update ON public.client_contacts FOR UPDATE USING (public.is_admin());
CREATE POLICY client_contacts_delete ON public.client_contacts FOR DELETE USING (public.is_admin());

-- client_documents
DROP POLICY IF EXISTS admin_all_client_documents ON public.client_documents;
DROP POLICY IF EXISTS cdp_insert_client_documents ON public.client_documents;
DROP POLICY IF EXISTS cdp_read_client_documents ON public.client_documents;
CREATE POLICY client_documents_select ON public.client_documents FOR SELECT USING (true);
CREATE POLICY client_documents_insert ON public.client_documents FOR INSERT
  WITH CHECK (public.is_admin() OR user_id = (SELECT auth.uid()));
CREATE POLICY client_documents_update ON public.client_documents FOR UPDATE USING (public.is_admin());
CREATE POLICY client_documents_delete ON public.client_documents FOR DELETE USING (public.is_admin());

-- client_notes
DROP POLICY IF EXISTS admin_all_client_notes ON public.client_notes;
DROP POLICY IF EXISTS cdp_insert_client_notes ON public.client_notes;
DROP POLICY IF EXISTS cdp_read_client_notes ON public.client_notes;
CREATE POLICY client_notes_select ON public.client_notes FOR SELECT USING (true);
CREATE POLICY client_notes_insert ON public.client_notes FOR INSERT
  WITH CHECK (public.is_admin() OR user_id = (SELECT auth.uid()));
CREATE POLICY client_notes_update ON public.client_notes FOR UPDATE USING (public.is_admin());
CREATE POLICY client_notes_delete ON public.client_notes FOR DELETE USING (public.is_admin());

-- donnees_financieres
DROP POLICY IF EXISTS admin_all_donnees_fin ON public.donnees_financieres;
DROP POLICY IF EXISTS cdp_read_donnees_fin ON public.donnees_financieres;
CREATE POLICY donnees_financieres_select ON public.donnees_financieres FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = donnees_financieres.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY donnees_financieres_insert ON public.donnees_financieres FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY donnees_financieres_update ON public.donnees_financieres FOR UPDATE USING (public.is_admin());
CREATE POLICY donnees_financieres_delete ON public.donnees_financieres FOR DELETE USING (public.is_admin());

-- echeances
DROP POLICY IF EXISTS admin_all_echeances ON public.echeances;
DROP POLICY IF EXISTS cdp_read_echeances ON public.echeances;
CREATE POLICY echeances_select ON public.echeances FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = echeances.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY echeances_insert ON public.echeances FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY echeances_update ON public.echeances FOR UPDATE USING (public.is_admin());
CREATE POLICY echeances_delete ON public.echeances FOR DELETE USING (public.is_admin());

-- echeanciers_templates
DROP POLICY IF EXISTS admin_all_echeanciers_templates ON public.echeanciers_templates;
DROP POLICY IF EXISTS all_select_echeanciers_templates ON public.echeanciers_templates;
CREATE POLICY echeanciers_templates_select ON public.echeanciers_templates FOR SELECT USING (true);
CREATE POLICY echeanciers_templates_insert ON public.echeanciers_templates FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY echeanciers_templates_update ON public.echeanciers_templates FOR UPDATE USING (public.is_admin());
CREATE POLICY echeanciers_templates_delete ON public.echeanciers_templates FOR DELETE USING (public.is_admin());

-- eduvia_companies
DROP POLICY IF EXISTS admin_all_eduvia_companies ON public.eduvia_companies;
DROP POLICY IF EXISTS cdp_read_eduvia_companies ON public.eduvia_companies;
CREATE POLICY eduvia_companies_select ON public.eduvia_companies FOR SELECT USING (true);
CREATE POLICY eduvia_companies_insert ON public.eduvia_companies FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY eduvia_companies_update ON public.eduvia_companies FOR UPDATE USING (public.is_admin());
CREATE POLICY eduvia_companies_delete ON public.eduvia_companies FOR DELETE USING (public.is_admin());

-- facturation_ajustements_pending
DROP POLICY IF EXISTS admin_all_ajustements_pending ON public.facturation_ajustements_pending;
DROP POLICY IF EXISTS cdp_select_ajustements_pending ON public.facturation_ajustements_pending;
CREATE POLICY facturation_ajustements_pending_select ON public.facturation_ajustements_pending FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = facturation_ajustements_pending.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
      AND p.archive = false
  )
);
CREATE POLICY facturation_ajustements_pending_insert ON public.facturation_ajustements_pending FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY facturation_ajustements_pending_update ON public.facturation_ajustements_pending FOR UPDATE USING (public.is_admin());
CREATE POLICY facturation_ajustements_pending_delete ON public.facturation_ajustements_pending FOR DELETE USING (public.is_admin());

-- facture_lignes
DROP POLICY IF EXISTS admin_all_facture_lignes ON public.facture_lignes;
DROP POLICY IF EXISTS cdp_read_facture_lignes ON public.facture_lignes;
CREATE POLICY facture_lignes_select ON public.facture_lignes FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM factures f JOIN projets p ON f.projet_id = p.id
    WHERE f.id = facture_lignes.facture_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY facture_lignes_insert ON public.facture_lignes FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY facture_lignes_update ON public.facture_lignes FOR UPDATE USING (public.is_admin());
CREATE POLICY facture_lignes_delete ON public.facture_lignes FOR DELETE USING (public.is_admin());

-- formations
DROP POLICY IF EXISTS admin_all_formations ON public.formations;
DROP POLICY IF EXISTS cdp_read_formations ON public.formations;
CREATE POLICY formations_select ON public.formations FOR SELECT USING (true);
CREATE POLICY formations_insert ON public.formations FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY formations_update ON public.formations FOR UPDATE USING (public.is_admin());
CREATE POLICY formations_delete ON public.formations FOR DELETE USING (public.is_admin());

-- jours_feries
DROP POLICY IF EXISTS admin_all_jours_feries ON public.jours_feries;
DROP POLICY IF EXISTS read_jours_feries ON public.jours_feries;
CREATE POLICY jours_feries_select ON public.jours_feries FOR SELECT USING (true);
CREATE POLICY jours_feries_insert ON public.jours_feries FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY jours_feries_update ON public.jours_feries FOR UPDATE USING (public.is_admin());
CREATE POLICY jours_feries_delete ON public.jours_feries FOR DELETE USING (public.is_admin());

-- kpi_snapshots
DROP POLICY IF EXISTS admin_all_snapshots ON public.kpi_snapshots;
DROP POLICY IF EXISTS cdp_read_snapshots ON public.kpi_snapshots;
CREATE POLICY kpi_snapshots_select ON public.kpi_snapshots FOR SELECT USING (
  public.is_admin()
  OR (scope = 'global'::scope_kpi)
  OR (scope = 'cdp'::scope_kpi AND scope_id = (SELECT auth.uid()))
  OR (scope = 'projet'::scope_kpi AND EXISTS (
    SELECT 1 FROM projets p WHERE p.id = kpi_snapshots.scope_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  ))
);
CREATE POLICY kpi_snapshots_insert ON public.kpi_snapshots FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY kpi_snapshots_update ON public.kpi_snapshots FOR UPDATE USING (public.is_admin());
CREATE POLICY kpi_snapshots_delete ON public.kpi_snapshots FOR DELETE USING (public.is_admin());

-- notifications
DROP POLICY IF EXISTS admin_all_notifications ON public.notifications;
DROP POLICY IF EXISTS cdp_read_notifications ON public.notifications;
DROP POLICY IF EXISTS cdp_update_notifications ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT
  USING (public.is_admin() OR user_id = (SELECT auth.uid()));
CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY notifications_update ON public.notifications FOR UPDATE
  USING (public.is_admin() OR user_id = (SELECT auth.uid()))
  WITH CHECK (public.is_admin() OR user_id = (SELECT auth.uid()));
CREATE POLICY notifications_delete ON public.notifications FOR DELETE USING (public.is_admin());

-- paiements
DROP POLICY IF EXISTS admin_all_paiements ON public.paiements;
DROP POLICY IF EXISTS cdp_read_paiements ON public.paiements;
CREATE POLICY paiements_select ON public.paiements FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM factures f JOIN projets p ON f.projet_id = p.id
    WHERE f.id = paiements.facture_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY paiements_insert ON public.paiements FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY paiements_update ON public.paiements FOR UPDATE USING (public.is_admin());
CREATE POLICY paiements_delete ON public.paiements FOR DELETE USING (public.is_admin());

-- production_mensuelle
DROP POLICY IF EXISTS admin_all_production ON public.production_mensuelle;
DROP POLICY IF EXISTS cdp_read_production ON public.production_mensuelle;
CREATE POLICY production_mensuelle_select ON public.production_mensuelle FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = production_mensuelle.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY production_mensuelle_insert ON public.production_mensuelle FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY production_mensuelle_update ON public.production_mensuelle FOR UPDATE USING (public.is_admin());
CREATE POLICY production_mensuelle_delete ON public.production_mensuelle FOR DELETE USING (public.is_admin());

-- progression_snapshots_weekly
DROP POLICY IF EXISTS admin_all_progression_snapshots ON public.progression_snapshots_weekly;
DROP POLICY IF EXISTS cdp_read_progression_snapshots ON public.progression_snapshots_weekly;
CREATE POLICY progression_snapshots_weekly_select ON public.progression_snapshots_weekly FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM contrats c JOIN projets p ON p.id = c.projet_id
    WHERE c.id = progression_snapshots_weekly.contrat_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY progression_snapshots_weekly_insert ON public.progression_snapshots_weekly FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY progression_snapshots_weekly_update ON public.progression_snapshots_weekly FOR UPDATE USING (public.is_admin());
CREATE POLICY progression_snapshots_weekly_delete ON public.progression_snapshots_weekly FOR DELETE USING (public.is_admin());

-- projet_documents
DROP POLICY IF EXISTS admin_all_projet_documents ON public.projet_documents;
DROP POLICY IF EXISTS cdp_delete_projet_documents ON public.projet_documents;
DROP POLICY IF EXISTS cdp_insert_projet_documents ON public.projet_documents;
DROP POLICY IF EXISTS cdp_read_projet_documents ON public.projet_documents;
CREATE POLICY projet_documents_select ON public.projet_documents FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = projet_documents.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);
CREATE POLICY projet_documents_insert ON public.projet_documents FOR INSERT WITH CHECK (
  public.is_admin() OR (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM projets p WHERE p.id = projet_documents.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  )
);
CREATE POLICY projet_documents_update ON public.projet_documents FOR UPDATE USING (public.is_admin());
CREATE POLICY projet_documents_delete ON public.projet_documents FOR DELETE USING (
  public.is_admin() OR (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM projets p WHERE p.id = projet_documents.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  )
);

-- prospect_notes
DROP POLICY IF EXISTS admin_all_prospect_notes ON public.prospect_notes;
DROP POLICY IF EXISTS pipeline_insert_prospect_notes ON public.prospect_notes;
DROP POLICY IF EXISTS pipeline_read_prospect_notes ON public.prospect_notes;
CREATE POLICY prospect_notes_select ON public.prospect_notes FOR SELECT
  USING (public.is_admin() OR public.has_pipeline_access());
CREATE POLICY prospect_notes_insert ON public.prospect_notes FOR INSERT WITH CHECK (
  public.is_admin() OR (public.has_pipeline_access() AND user_id = (SELECT auth.uid()))
);
CREATE POLICY prospect_notes_update ON public.prospect_notes FOR UPDATE USING (public.is_admin());
CREATE POLICY prospect_notes_delete ON public.prospect_notes FOR DELETE USING (public.is_admin());

-- prospect_stage_history
DROP POLICY IF EXISTS admin_all_prospect_stage_history ON public.prospect_stage_history;
DROP POLICY IF EXISTS pipeline_read_prospect_stage_history ON public.prospect_stage_history;
CREATE POLICY prospect_stage_history_select ON public.prospect_stage_history FOR SELECT
  USING (public.is_admin() OR public.has_pipeline_access());
CREATE POLICY prospect_stage_history_insert ON public.prospect_stage_history FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY prospect_stage_history_update ON public.prospect_stage_history FOR UPDATE USING (public.is_admin());
CREATE POLICY prospect_stage_history_delete ON public.prospect_stage_history FOR DELETE USING (public.is_admin());

-- prospects
DROP POLICY IF EXISTS admin_all_prospects ON public.prospects;
DROP POLICY IF EXISTS pipeline_insert_prospects ON public.prospects;
DROP POLICY IF EXISTS pipeline_read_prospects ON public.prospects;
DROP POLICY IF EXISTS pipeline_update_prospects ON public.prospects;
CREATE POLICY prospects_select ON public.prospects FOR SELECT
  USING (public.is_admin() OR public.has_pipeline_access());
CREATE POLICY prospects_insert ON public.prospects FOR INSERT
  WITH CHECK (public.is_admin() OR public.has_pipeline_access());
CREATE POLICY prospects_update ON public.prospects FOR UPDATE
  USING (public.is_admin() OR public.has_pipeline_access());
CREATE POLICY prospects_delete ON public.prospects FOR DELETE USING (public.is_admin());

-- qualite_assignments
DROP POLICY IF EXISTS admin_all_qualite_assignments ON public.qualite_assignments;
DROP POLICY IF EXISTS cdp_select_qualite_assignments ON public.qualite_assignments;
CREATE POLICY qualite_assignments_select ON public.qualite_assignments FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM projets p WHERE p.client_id = qualite_assignments.client_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
      AND p.archive = false
  )
);
CREATE POLICY qualite_assignments_insert ON public.qualite_assignments FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY qualite_assignments_update ON public.qualite_assignments FOR UPDATE USING (public.is_admin());
CREATE POLICY qualite_assignments_delete ON public.qualite_assignments FOR DELETE USING (public.is_admin());

-- users
DROP POLICY IF EXISTS admin_all_users ON public.users;
DROP POLICY IF EXISTS cdp_read_users ON public.users;
CREATE POLICY users_select ON public.users FOR SELECT USING (true);
CREATE POLICY users_insert ON public.users FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY users_update ON public.users FOR UPDATE USING (public.is_admin() OR id = (SELECT auth.uid()));
CREATE POLICY users_delete ON public.users FOR DELETE USING (public.is_admin());

-- contrats_progressions : split ALL admin en INSERT/UPDATE/DELETE seuls
DROP POLICY IF EXISTS contrats_progressions_admin_all ON public.contrats_progressions;
CREATE POLICY contrats_progressions_insert ON public.contrats_progressions FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY contrats_progressions_update ON public.contrats_progressions FOR UPDATE USING (public.is_admin());
CREATE POLICY contrats_progressions_delete ON public.contrats_progressions FOR DELETE USING (public.is_admin());

-- eduvia_invoice_forecast_steps
DROP POLICY IF EXISTS eduvia_invoice_forecast_steps_admin_all ON public.eduvia_invoice_forecast_steps;
CREATE POLICY eduvia_invoice_forecast_steps_insert ON public.eduvia_invoice_forecast_steps FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY eduvia_invoice_forecast_steps_update ON public.eduvia_invoice_forecast_steps FOR UPDATE USING (public.is_admin());
CREATE POLICY eduvia_invoice_forecast_steps_delete ON public.eduvia_invoice_forecast_steps FOR DELETE USING (public.is_admin());

-- eduvia_invoice_steps
DROP POLICY IF EXISTS eduvia_invoice_steps_admin_all ON public.eduvia_invoice_steps;
CREATE POLICY eduvia_invoice_steps_insert ON public.eduvia_invoice_steps FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY eduvia_invoice_steps_update ON public.eduvia_invoice_steps FOR UPDATE USING (public.is_admin());
CREATE POLICY eduvia_invoice_steps_delete ON public.eduvia_invoice_steps FOR DELETE USING (public.is_admin());

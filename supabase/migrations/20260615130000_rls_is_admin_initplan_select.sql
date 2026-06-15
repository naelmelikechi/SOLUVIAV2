-- Perf RLS : hoist is_admin() en InitPlan sur toutes les policies SELECT.
--
-- Les policies SELECT appelaient public.is_admin() bare -> potentiellement
-- reevalue par ligne. auth.uid() etait deja wrappe en (SELECT auth.uid())
-- (InitPlan, cf 20260511163439) mais pas is_admin(). On enveloppe is_admin()
-- en (SELECT is_admin()) : evaluation unique par requete au lieu de par ligne,
-- conforme au lint Supabase auth_rls_initplan. SEMANTIQUEMENT IDENTIQUE (meme
-- booleen) : seul le timing change, aucun impact sur qui voit quoi.
--
-- Genere depuis pg_policies (etat final) puis verifie en local : diff
-- pg_policies avant/apres == uniquement le wrap is_admin, suite pgTAP au vert.
-- SELECT uniquement (INSERT/UPDATE/DELETE touchent 1 ligne, aucun gain per-row).

DROP POLICY IF EXISTS absences_select ON public.absences;
CREATE POLICY absences_select ON public.absences FOR SELECT TO public USING ((( SELECT is_admin()) OR (user_id = ( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS contrats_select ON public.contrats;
CREATE POLICY contrats_select ON public.contrats FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.id = contrats.projet_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS contrats_progressions_select ON public.contrats_progressions;
CREATE POLICY contrats_progressions_select ON public.contrats_progressions FOR SELECT TO authenticated USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM (contrats c
     JOIN projets p ON ((p.id = c.projet_id)))
  WHERE ((c.id = contrats_progressions.contrat_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS donnees_financieres_select ON public.donnees_financieres;
CREATE POLICY donnees_financieres_select ON public.donnees_financieres FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.id = donnees_financieres.projet_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS echeances_select ON public.echeances;
CREATE POLICY echeances_select ON public.echeances FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.id = echeances.projet_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS eduvia_invoice_forecast_steps_select ON public.eduvia_invoice_forecast_steps;
CREATE POLICY eduvia_invoice_forecast_steps_select ON public.eduvia_invoice_forecast_steps FOR SELECT TO authenticated USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM (contrats c
     JOIN projets p ON ((p.id = c.projet_id)))
  WHERE ((c.id = eduvia_invoice_forecast_steps.contrat_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS eduvia_invoice_lines_select ON public.eduvia_invoice_lines;
CREATE POLICY eduvia_invoice_lines_select ON public.eduvia_invoice_lines FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM (contrats c
     JOIN projets p ON ((p.id = c.projet_id)))
  WHERE ((c.id = eduvia_invoice_lines.contrat_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS eduvia_invoice_steps_select ON public.eduvia_invoice_steps;
CREATE POLICY eduvia_invoice_steps_select ON public.eduvia_invoice_steps FOR SELECT TO authenticated USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM (contrats c
     JOIN projets p ON ((p.id = c.projet_id)))
  WHERE ((c.id = eduvia_invoice_steps.contrat_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS eduvia_sync_logs_select ON public.eduvia_sync_logs;
CREATE POLICY eduvia_sync_logs_select ON public.eduvia_sync_logs FOR SELECT TO authenticated USING (( SELECT is_admin()));

DROP POLICY IF EXISTS facturation_ajustements_pending_select ON public.facturation_ajustements_pending;
CREATE POLICY facturation_ajustements_pending_select ON public.facturation_ajustements_pending FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.id = facturation_ajustements_pending.projet_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))) AND (p.archive = false))))));

DROP POLICY IF EXISTS facture_lignes_select ON public.facture_lignes;
CREATE POLICY facture_lignes_select ON public.facture_lignes FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM (factures f
     JOIN projets p ON ((f.projet_id = p.id)))
  WHERE ((f.id = facture_lignes.facture_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS factures_select ON public.factures;
CREATE POLICY factures_select ON public.factures FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.id = factures.projet_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS kpi_snapshots_select ON public.kpi_snapshots;
CREATE POLICY kpi_snapshots_select ON public.kpi_snapshots FOR SELECT TO public USING ((( SELECT is_admin()) OR (scope = 'global'::scope_kpi) OR ((scope = 'cdp'::scope_kpi) AND (scope_id = ( SELECT auth.uid() AS uid))) OR ((scope = 'projet'::scope_kpi) AND (EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.id = kpi_snapshots.scope_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid)))))))));

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO public USING ((( SELECT is_admin()) OR (user_id = ( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS odoo_sync_logs_select ON public.odoo_sync_logs;
CREATE POLICY odoo_sync_logs_select ON public.odoo_sync_logs FOR SELECT TO authenticated USING (( SELECT is_admin()));

DROP POLICY IF EXISTS paiements_select ON public.paiements;
CREATE POLICY paiements_select ON public.paiements FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM (factures f
     JOIN projets p ON ((f.projet_id = p.id)))
  WHERE ((f.id = paiements.facture_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS production_mensuelle_select ON public.production_mensuelle;
CREATE POLICY production_mensuelle_select ON public.production_mensuelle FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.id = production_mensuelle.projet_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS progression_snapshots_weekly_select ON public.progression_snapshots_weekly;
CREATE POLICY progression_snapshots_weekly_select ON public.progression_snapshots_weekly FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM (contrats c
     JOIN projets p ON ((p.id = c.projet_id)))
  WHERE ((c.id = progression_snapshots_weekly.contrat_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS projet_documents_select ON public.projet_documents;
CREATE POLICY projet_documents_select ON public.projet_documents FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.id = projet_documents.projet_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS projets_select ON public.projets;
CREATE POLICY projets_select ON public.projets FOR SELECT TO public USING ((( SELECT is_admin()) OR (cdp_id = ( SELECT auth.uid() AS uid)) OR (backup_cdp_id = ( SELECT auth.uid() AS uid)) OR (est_interne = true)));

DROP POLICY IF EXISTS prospect_notes_select ON public.prospect_notes;
CREATE POLICY prospect_notes_select ON public.prospect_notes FOR SELECT TO public USING ((( SELECT is_admin()) OR has_pipeline_access()));

DROP POLICY IF EXISTS prospect_stage_history_select ON public.prospect_stage_history;
CREATE POLICY prospect_stage_history_select ON public.prospect_stage_history FOR SELECT TO public USING ((( SELECT is_admin()) OR has_pipeline_access()));

DROP POLICY IF EXISTS prospects_select ON public.prospects;
CREATE POLICY prospects_select ON public.prospects FOR SELECT TO public USING ((( SELECT is_admin()) OR has_pipeline_access()));

DROP POLICY IF EXISTS qualite_assignments_select ON public.qualite_assignments;
CREATE POLICY qualite_assignments_select ON public.qualite_assignments FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.client_id = qualite_assignments.client_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))) AND (p.archive = false))))));

DROP POLICY IF EXISTS rdv_commerciaux_select ON public.rdv_commerciaux;
CREATE POLICY rdv_commerciaux_select ON public.rdv_commerciaux FOR SELECT TO public USING ((( SELECT is_admin()) OR has_pipeline_access()));

DROP POLICY IF EXISTS rdv_formateurs_select ON public.rdv_formateurs;
CREATE POLICY rdv_formateurs_select ON public.rdv_formateurs FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.id = rdv_formateurs.projet_id) AND ((p.cdp_id = ( SELECT auth.uid() AS uid)) OR (p.backup_cdp_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS saisies_temps_select ON public.saisies_temps;
CREATE POLICY saisies_temps_select ON public.saisies_temps FOR SELECT TO public USING ((( SELECT is_admin()) OR (user_id = ( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS saisies_temps_axes_select ON public.saisies_temps_axes;
CREATE POLICY saisies_temps_axes_select ON public.saisies_temps_axes FOR SELECT TO public USING ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM saisies_temps st
  WHERE ((st.id = saisies_temps_axes.saisie_id) AND (st.user_id = ( SELECT auth.uid() AS uid)))))));

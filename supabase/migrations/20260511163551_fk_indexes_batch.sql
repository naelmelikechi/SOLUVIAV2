-- Ajout d index sur les 26 cles etrangeres sans index (Supabase advisor
-- lint 0001_unindexed_foreign_keys).
--
-- Sans index, chaque cascade DELETE ou JOIN sur la table referencante
-- declenche un seq scan complet. Sur les tables qui peuvent grossir
-- (apprenants, factures, eduvia_invoice_steps, etc.) c est un risque
-- de degradation silencieuse.
--
-- Toutes les FK sont sur des colonnes nullable ou UUID, donc des index
-- btree partiels (WHERE NOT NULL) auraient un meilleur ratio espace/perf.
-- Pour la phase 1 on fait simple : btree complet. Optimisation possible
-- ulterieurement si pg_stat_user_indexes montre du gaspillage.

CREATE INDEX IF NOT EXISTS idx_apprenants_contrat_id ON public.apprenants (contrat_id);
CREATE INDEX IF NOT EXISTS idx_apprenants_source_client_id ON public.apprenants (source_client_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_resolved_by ON public.bug_reports (resolved_by);
CREATE INDEX IF NOT EXISTS idx_client_documents_user_id ON public.client_documents (user_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_user_id ON public.client_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_contrats_source_client_id ON public.contrats (source_client_id);
CREATE INDEX IF NOT EXISTS idx_echeances_facture_id ON public.echeances (facture_id);
CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_forecast_steps_source_client_id ON public.eduvia_invoice_forecast_steps (source_client_id);
CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_steps_source_client_id ON public.eduvia_invoice_steps (source_client_id);
CREATE INDEX IF NOT EXISTS idx_facturation_ajustements_pending_projet_id ON public.facturation_ajustements_pending (projet_id);
CREATE INDEX IF NOT EXISTS idx_facturation_ajustements_pending_resolved_by ON public.facturation_ajustements_pending (resolved_by);
CREATE INDEX IF NOT EXISTS idx_facturation_ajustements_pending_resolved_facture_id ON public.facturation_ajustements_pending (resolved_facture_id);
CREATE INDEX IF NOT EXISTS idx_factures_created_by ON public.factures (created_by);
CREATE INDEX IF NOT EXISTS idx_factures_facture_origine_id ON public.factures (facture_origine_id);
CREATE INDEX IF NOT EXISTS idx_formations_source_client_id ON public.formations (source_client_id);
CREATE INDEX IF NOT EXISTS idx_idees_implementee_par ON public.idees (implementee_par);
CREATE INDEX IF NOT EXISTS idx_idees_validee_par ON public.idees (validee_par);
CREATE INDEX IF NOT EXISTS idx_parametres_updated_by ON public.parametres (updated_by);
CREATE INDEX IF NOT EXISTS idx_projet_documents_user_id ON public.projet_documents (user_id);
CREATE INDEX IF NOT EXISTS idx_projets_echeancier_template_id ON public.projets (echeancier_template_id);
CREATE INDEX IF NOT EXISTS idx_prospect_notes_user_id ON public.prospect_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_prospect_stage_history_changed_by ON public.prospect_stage_history (changed_by);
CREATE INDEX IF NOT EXISTS idx_prospects_client_id ON public.prospects (client_id);
CREATE INDEX IF NOT EXISTS idx_qualite_assignments_created_by ON public.qualite_assignments (created_by);
CREATE INDEX IF NOT EXISTS idx_rdv_formateurs_formateur_id ON public.rdv_formateurs (formateur_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_user_id ON public.team_messages (user_id);

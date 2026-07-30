-- Résolution des issues du Supabase advisor (Security + Performance) relevées
-- sur soluvia-prod, hors "unused_index".
--
-- Trois lots, sémantiquement neutres :
--   1. function_search_path_mutable (SECURITY / WARN, 3 fonctions)
--   2. auth_rls_initplan            (PERFORMANCE / WARN, 5 policies CRM)
--   3. unindexed_foreign_keys       (PERFORMANCE / INFO, 14 FK)
--
-- NON traité volontairement : lint "unused_index" (60 index INFO). idx_scan = 0
-- est un FAUX signal sur cette base peu sollicitée — cf.
-- 20260630130000_restore_hot_indexes.sql, où l'équipe a dû recréer des index
-- chauds droppés à tort par 20260511225230_drop_unused_indexes_phase1.sql.
-- Plusieurs index actuellement flaggés "unused" sont justement ces index
-- vérifiés-chauds (idx_projets_statut, idx_apprenants_contrat_id, …). Les
-- dropper reproduirait l'erreur documentée.

-- ============================================================================
-- 1. function_search_path_mutable (SECURITY)
--    Épingle un search_path fixe (pg_temp en dernier) pour empêcher tout
--    shadowing via une TEMP TABLE. Aucune fonction ne référence d'objet hors
--    de son schéma + built-ins, sauf search_process_trgm (similarity ∈ extensions).
-- ============================================================================
ALTER FUNCTION crm.set_updated_at() SET search_path = crm, pg_catalog, pg_temp;
ALTER FUNCTION crm.set_updated_at_opportunites() SET search_path = crm, pg_catalog, pg_temp;
ALTER FUNCTION public.search_process_trgm(text) SET search_path = public, extensions, pg_catalog, pg_temp;

-- ============================================================================
-- 2. auth_rls_initplan (PERFORMANCE)
--    Enveloppe auth.uid() dans (SELECT auth.uid()) : évalué une fois par query
--    (InitPlan) au lieu d'une fois par ligne. Conditions inchangées.
--    is_admin() (crm_recaps_select) n'est pas concerné par le lint.
-- ============================================================================
DROP POLICY IF EXISTS crm_notifications_select ON crm.notifications;
CREATE POLICY crm_notifications_select ON crm.notifications
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS crm_notifications_update ON crm.notifications;
CREATE POLICY crm_notifications_update ON crm.notifications
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS crm_notifications_delete ON crm.notifications;
CREATE POLICY crm_notifications_delete ON crm.notifications
  FOR DELETE USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS crm_notifications_insert ON crm.notifications;
CREATE POLICY crm_notifications_insert ON crm.notifications
  FOR INSERT WITH CHECK (actor_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS crm_recaps_insert ON crm.recaps;
CREATE POLICY crm_recaps_insert ON crm.recaps
  FOR INSERT WITH CHECK (trigger = 'manuel' AND actor_id = (SELECT auth.uid()));

-- ============================================================================
-- 3. unindexed_foreign_keys (PERFORMANCE)
--    Index btree couvrant chaque FK sans index (seq scan sur cascade DELETE /
--    join sinon). Nommage aligné par schéma : crm => <table>_<col>_idx,
--    public => idx_<table>_<col>.
-- ============================================================================
CREATE INDEX IF NOT EXISTS activites_auteur_id_idx ON crm.activites (auteur_id);
CREATE INDEX IF NOT EXISTS comptes_responsable_id_idx ON crm.comptes (responsable_id);
CREATE INDEX IF NOT EXISTS notifications_actor_id_idx ON crm.notifications (actor_id);
CREATE INDEX IF NOT EXISTS opportunites_contact_principal_id_idx ON crm.opportunites (contact_principal_id);
CREATE INDEX IF NOT EXISTS rdv_created_by_idx ON crm.rdv (created_by);
CREATE INDEX IF NOT EXISTS recaps_actor_id_idx ON crm.recaps (actor_id);
CREATE INDEX IF NOT EXISTS relances_created_by_idx ON crm.relances (created_by);

CREATE INDEX IF NOT EXISTS idx_cdp_affectation_history_changed_by ON public.cdp_affectation_history (changed_by);
CREATE INDEX IF NOT EXISTS idx_cdp_affectation_history_from_cdp_id ON public.cdp_affectation_history (from_cdp_id);
CREATE INDEX IF NOT EXISTS idx_cdp_affectation_history_to_cdp_id ON public.cdp_affectation_history (to_cdp_id);
CREATE INDEX IF NOT EXISTS idx_document_synthese_genere_par ON public.document_synthese (genere_par);
CREATE INDEX IF NOT EXISTS idx_document_synthese_signature_id ON public.document_synthese (signature_id);
CREATE INDEX IF NOT EXISTS idx_document_template_versions_published_by ON public.document_template_versions (published_by);
CREATE INDEX IF NOT EXISTS idx_signature_requests_initiated_by ON public.signature_requests (initiated_by);

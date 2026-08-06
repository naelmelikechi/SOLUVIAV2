-- ===========================================================================
-- Reparation du drift revele par le garde-fou anti-drift etendu
-- (audit #122, constat 17c / chantier B)
-- ===========================================================================
--
-- Le check anti-drift ne comparait que des NOMS DE COLONNES. Etendu aux
-- policies, fonctions, triggers, index, contraintes et au schema storage, il
-- revele du jour au lendemain 37 objets presents en PROD mais qu'aucune
-- migration ne cree. Cette migration les reproduit, releves un par un sur la
-- base de production via pg-meta.
--
-- Sans cette reparation, une reconstruction depuis les migrations (CI, Supabase
-- local, nouvelle instance) ne produirait PAS ces objets, et le code tournerait
-- sur un schema silencieusement different de la prod.
--
-- Entierement idempotente : no-op en prod, creation en local et en CI.
--
-- ---------------------------------------------------------------------------
-- 1. 28 index de cles etrangeres
-- ---------------------------------------------------------------------------
-- Ils ont ete crees directement en prod le 2026-05-26 pour repondre aux
-- advisors Supabase (une cle etrangere sans index rend les jointures et les
-- verifications d'integrite lentes), sans migration correspondante. Une base
-- reconstruite depuis le repo n'aurait donc aucun de ces index : regression de
-- performance invisible, et divergence de plans d'execution entre local et prod.

CREATE INDEX IF NOT EXISTS idx_apprenants_source_client_id ON public.apprenants USING btree (source_client_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_resolved_by ON public.bug_reports USING btree (resolved_by);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON public.bug_reports USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_client_documents_user_id ON public.client_documents USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_user_id ON public.client_notes USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_clients_apporteur_commercial_id ON public.clients USING btree (apporteur_commercial_id);
CREATE INDEX IF NOT EXISTS idx_contrats_source_client_id ON public.contrats USING btree (source_client_id);
CREATE INDEX IF NOT EXISTS idx_devis_created_by ON public.devis USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_forecast_steps_source_client_id ON public.eduvia_invoice_forecast_steps USING btree (source_client_id);
CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_lines_source_client_id ON public.eduvia_invoice_lines USING btree (source_client_id);
CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_steps_source_client_id ON public.eduvia_invoice_steps USING btree (source_client_id);
CREATE INDEX IF NOT EXISTS idx_facturation_ajustements_pending_projet_id ON public.facturation_ajustements_pending USING btree (projet_id);
CREATE INDEX IF NOT EXISTS idx_facturation_ajustements_pending_resolved_by ON public.facturation_ajustements_pending USING btree (resolved_by);
CREATE INDEX IF NOT EXISTS idx_factures_created_by ON public.factures USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_formations_source_client_id ON public.formations USING btree (source_client_id);
CREATE INDEX IF NOT EXISTS idx_idees_auteur_id ON public.idees USING btree (auteur_id);
CREATE INDEX IF NOT EXISTS idx_idees_implementee_par ON public.idees USING btree (implementee_par);
CREATE INDEX IF NOT EXISTS idx_idees_validee_par ON public.idees USING btree (validee_par);
CREATE INDEX IF NOT EXISTS idx_notifications_subject_user_id ON public.notifications USING btree (subject_user_id);
CREATE INDEX IF NOT EXISTS idx_parametres_updated_by ON public.parametres USING btree (updated_by);
CREATE INDEX IF NOT EXISTS idx_projet_documents_user_id ON public.projet_documents USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_projets_echeancier_template_id ON public.projets USING btree (echeancier_template_id);
CREATE INDEX IF NOT EXISTS idx_projets_typologie_id ON public.projets USING btree (typologie_id);
CREATE INDEX IF NOT EXISTS idx_qualite_assignments_created_by ON public.qualite_assignments USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_qualite_assignments_user_id ON public.qualite_assignments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_rdv_formateurs_cdp_id ON public.rdv_formateurs USING btree (cdp_id);
CREATE INDEX IF NOT EXISTS idx_rdv_formateurs_formateur_id ON public.rdv_formateurs USING btree (formateur_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_user_id ON public.team_messages USING btree (user_id);

-- ---------------------------------------------------------------------------
-- 2. 9 policies d'ecriture admin, sous leur forme REELLE en prod
-- ---------------------------------------------------------------------------
-- Les migrations du repo declarent UNE policy `FOR ALL` par table
-- (*_admin_write / *_write_admin). La prod, elle, porte TROIS policies
-- distinctes INSERT / UPDATE / DELETE, issues de la consolidation des policies
-- multi-permissives (advisors Supabase, 2026-05-26) appliquee en prod sans
-- migration.
--
-- La regle metier est IDENTIQUE dans les deux formes (admin ou superadmin, via
-- get_user_role()) : il n'y a donc jamais eu de faille. Mais le repo ne
-- decrivait pas l'etat reel, et une reconstruction aurait recree la forme `ALL`.
-- On aligne le repo sur la prod, en conservant la convention du projet
-- (get_user_role() IN ('admin','superadmin'), cf MEMORY / RLS).


-- categories_internes
DROP POLICY IF EXISTS cat_internes_admin_write ON public.categories_internes;
DROP POLICY IF EXISTS cat_internes_admin_delete ON public.categories_internes;
CREATE POLICY cat_internes_admin_delete ON public.categories_internes
  FOR DELETE
  TO authenticated
  USING ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])));
DROP POLICY IF EXISTS cat_internes_admin_insert ON public.categories_internes;
CREATE POLICY cat_internes_admin_insert ON public.categories_internes
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])));
DROP POLICY IF EXISTS cat_internes_admin_update ON public.categories_internes;
CREATE POLICY cat_internes_admin_update ON public.categories_internes
  FOR UPDATE
  TO authenticated
  USING ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])))
  WITH CHECK ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])));

-- opcos
DROP POLICY IF EXISTS opcos_write_admin ON public.opcos;
DROP POLICY IF EXISTS opcos_delete_admin ON public.opcos;
CREATE POLICY opcos_delete_admin ON public.opcos
  FOR DELETE
  TO authenticated
  USING ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])));
DROP POLICY IF EXISTS opcos_insert_admin ON public.opcos;
CREATE POLICY opcos_insert_admin ON public.opcos
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])));
DROP POLICY IF EXISTS opcos_update_admin ON public.opcos;
CREATE POLICY opcos_update_admin ON public.opcos
  FOR UPDATE
  TO authenticated
  USING ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])))
  WITH CHECK ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])));

-- societes_emettrices
DROP POLICY IF EXISTS societes_emettrices_admin_write ON public.societes_emettrices;
DROP POLICY IF EXISTS societes_emettrices_delete_admin ON public.societes_emettrices;
CREATE POLICY societes_emettrices_delete_admin ON public.societes_emettrices
  FOR DELETE
  TO authenticated
  USING ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])));
DROP POLICY IF EXISTS societes_emettrices_insert_admin ON public.societes_emettrices;
CREATE POLICY societes_emettrices_insert_admin ON public.societes_emettrices
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])));
DROP POLICY IF EXISTS societes_emettrices_update_admin ON public.societes_emettrices;
CREATE POLICY societes_emettrices_update_admin ON public.societes_emettrices
  FOR UPDATE
  TO authenticated
  USING ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])))
  WITH CHECK ((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['admin'::text, 'superadmin'::text])));

-- Hygiene search_path : ajoute pg_temp en DERNIER aux fonctions epinglees
-- `public[, pg_catalog]` sans pg_temp. Sans cela, le pg_temp IMPLICITE est
-- cherche en PREMIER pour les relations : un role pouvant executer du SQL
-- direct pourrait shadow une table (ex: users) via une TEMP TABLE.
-- Inexploitable via PostgREST (pas de CREATE TEMP) : defense en profondeur.
--
-- Liste etablie depuis pg_proc (etat reel), pas depuis les migrations :
-- generate_facture_ref / assign_facture_ref_on_send ont deja pg_temp via
-- 20260524110000. opcos_check_idcc a search_path='' (deja sur). La policy
-- odoo_sync_logs SELECT-only est traitee par 20260610100000.

-- Epinglees public, pg_catalog (20260424123743 + 20260428110000 + 20260511142735)
ALTER FUNCTION public.is_admin() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.is_commercial() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.has_pipeline_access() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.has_validate_ideas_access() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.has_ship_ideas_access() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.get_user_role() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.generate_projet_ref() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.generate_contrat_ref() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.generate_trigramme() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.check_daily_hours_max() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.stamp_tache_qualite_realisation() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.facture_lignes_set_est_avoir() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.factures_propagate_est_avoir() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.log_prospect_stage_change() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.get_prospect_time_in_stage_median() SET search_path = public, pg_catalog, pg_temp;

-- Epinglees public seul (inline dans leur CREATE). NB : on insere aussi
-- pg_catalog explicitement (avant : implicite donc cherche en PREMIER ;
-- apres : cherche apres public). Zero collision public/pg_catalog verifiee
-- en base, et anon/authenticated n'ont pas CREATE sur public - harmonise
-- avec les 16 fonctions ci-dessus epinglees ainsi depuis 20260424123743.
ALTER FUNCTION public.resolve_collaborateur_a_affecter() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.sync_derniere_connexion() SET search_path = public, pg_catalog, pg_temp;

-- Cas particulier : a besoin du schema auth
ALTER FUNCTION public.list_auth_orphans(int) SET search_path = public, auth, pg_temp;

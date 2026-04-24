-- Epingle le search_path des fonctions SECURITY DEFINER (et helpers publics
-- equivalents) a public + pg_catalog. Ferme le WARN 0011 de l advisor
-- Supabase: sans search_path epingle, un utilisateur peut creer un schema
-- avec le meme nom de fonction qui prend le pas a l execution.
--
-- PG 15+ supporte ALTER FUNCTION ... SET search_path = ... sans toucher
-- le corps de la fonction.

ALTER FUNCTION public.is_admin() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_commercial() SET search_path = public, pg_catalog;
ALTER FUNCTION public.has_pipeline_access() SET search_path = public, pg_catalog;
ALTER FUNCTION public.has_validate_ideas_access() SET search_path = public, pg_catalog;
ALTER FUNCTION public.has_ship_ideas_access() SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_user_role() SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_projet_ref() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_contrat_ref() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_facture_ref() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_trigramme() SET search_path = public, pg_catalog;
ALTER FUNCTION public.check_daily_hours_max() SET search_path = public, pg_catalog;
ALTER FUNCTION public.stamp_tache_qualite_realisation() SET search_path = public, pg_catalog;

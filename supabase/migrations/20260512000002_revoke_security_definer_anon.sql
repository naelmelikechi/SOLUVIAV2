-- Reduit la surface d attaque des fonctions SECURITY DEFINER exposees
-- automatiquement par PostgREST sur /rest/v1/rpc/*. Resout les warnings
-- security advisor 0028 (anon) entierement.
--
-- Note : les warnings 0029 restant (authenticated_security_definer) sur
-- les helpers RLS (is_admin, get_user_role, has_*_access) sont by design :
-- l'evaluation des policies RLS depuis un user authenticated necessite
-- EXECUTE sur ces fonctions. Les 2 RPC user-facing (delete_user_cascade,
-- get_prospect_time_in_stage_median) sont volontairement exposees avec
-- check d'auth interne.
--
-- Strategie :
--  * Triggers : REVOKE FROM PUBLIC (les triggers s'executent comme
--    definer, pas besoin d'EXECUTE sur le role appelant).
--  * RLS helpers + RPC user-facing : REVOKE FROM PUBLIC + GRANT explicite
--    a authenticated. service_role conserve EXECUTE par defaut (owned).

-- ---------------------------------------------------------------------------
-- Triggers (jamais appeles via REST) : revoke PUBLIC suffit
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.log_prospect_stage_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_collaborateur_a_affecter() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- RLS helpers + RPC user-facing : revoke PUBLIC, regrant authenticated
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_commercial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_commercial() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_pipeline_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_pipeline_access() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_ship_ideas_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_ship_ideas_access() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_validate_ideas_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_validate_ideas_access() TO authenticated;

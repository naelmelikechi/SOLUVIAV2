
-- REVOKE FROM PUBLIC : retire l'EXECUTE par defaut (anon ET authenticated
-- via inheritance). Pour les fonctions encore utilisees par l'app, on
-- regrant explicitement a authenticated/service_role.

-- Triggers (jamais appeles via REST, juste fired by triggers en tant que
-- definer) : revoke PUBLIC suffit, pas besoin de regrant.
REVOKE EXECUTE ON FUNCTION public.log_prospect_stage_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_collaborateur_a_affecter() FROM PUBLIC;

-- RLS helpers : revoke PUBLIC, regrant authenticated (deja present mais on
-- est explicite).
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

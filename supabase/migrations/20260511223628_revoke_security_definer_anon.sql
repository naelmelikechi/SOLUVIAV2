
REVOKE EXECUTE ON FUNCTION public.log_prospect_stage_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_collaborateur_a_affecter() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_auth_orphans(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_commercial() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_pipeline_access() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_ship_ideas_access() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_validate_ideas_access() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_user_cascade(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_prospect_time_in_stage_median() FROM anon;

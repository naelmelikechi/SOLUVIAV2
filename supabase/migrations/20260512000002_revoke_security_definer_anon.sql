-- Reduit la surface d attaque des fonctions SECURITY DEFINER exposees
-- automatiquement par PostgREST sur /rest/v1/rpc/*. Resout les warnings
-- security advisor 0028 (anon) et 0029 (authenticated) cibles.
--
-- Strategie :
--  * Triggers + fonctions admin-only (service_role) : REVOKE des deux roles
--    (anon ET authenticated). PostgreSQL n exige pas EXECUTE pour les
--    triggers - donc pas de regression.
--  * RLS helpers + RPC user-facing : REVOKE anon seulement. authenticated
--    garde EXECUTE pour que les policies RLS et les .rpc() cote app
--    continuent de fonctionner.
--
-- service_role conserve EXECUTE par defaut sur tout (ne fait pas partie
-- de PUBLIC, pas affecte par les REVOKE FROM anon, authenticated).

-- ---------------------------------------------------------------------------
-- Triggers + admin-only : revoke anon + authenticated
-- ---------------------------------------------------------------------------

-- Trigger sur prospects.stage (cf 20260428110000_prospect_stage_history.sql)
REVOKE EXECUTE ON FUNCTION public.log_prospect_stage_change()
  FROM anon, authenticated;

-- Trigger sur notifications (cf 20260428104100_notification_subject_user.sql)
REVOKE EXECUTE ON FUNCTION public.resolve_collaborateur_a_affecter()
  FROM anon, authenticated;

-- CRON cleanup auth orphelins (createAdminClient, service_role uniquement)
REVOKE EXECUTE ON FUNCTION public.list_auth_orphans(integer)
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS helpers + RPC user-facing : revoke anon seulement
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_commercial() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_pipeline_access() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_ship_ideas_access() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_validate_ideas_access() FROM anon;

-- delete_user_cascade : appele par admin via supabase.rpc (authenticated +
-- check is_admin cote serveur). Pas besoin pour anon.
REVOKE EXECUTE ON FUNCTION public.delete_user_cascade(uuid) FROM anon;

-- Reporting prospects : appele par authenticated via supabase.rpc.
REVOKE EXECUTE ON FUNCTION public.get_prospect_time_in_stage_median()
  FROM anon;

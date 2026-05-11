-- Vue admin_auth_orphans : auth.users SANS row correspondante dans public.users.
-- Cas d apparition : INSERT public.users a fail apres createUser, ET le rollback
-- de l auth.user a aussi fail (bug reseau, race). Le CRON cleanup-auth-orphans
-- les purge apres 24h. Une re-invitation avec le meme email est bloquee tant
-- que l orphelin existe (createUser retourne "User already registered").
--
-- Securite : la vue est lue uniquement par le CRON et un superadmin (via RPC).
-- On n expose pas un SELECT direct sur la vue pour eviter de leak des emails
-- via les Server Components - on passe par une fonction SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.list_auth_orphans(
  p_older_than_hours int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT au.id, au.email, au.created_at
  FROM auth.users au
  LEFT JOIN public.users pu ON pu.id = au.id
  WHERE pu.id IS NULL
    AND au.created_at < (now() - make_interval(hours => p_older_than_hours))
  ORDER BY au.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_auth_orphans(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_auth_orphans(int) TO authenticated, service_role;

COMMENT ON FUNCTION public.list_auth_orphans IS
  'Liste les auth.users sans row public.users associee, optionnellement filtres aux orphelins > N heures. Utilise par le CRON cleanup-auth-orphans et par un eventuel ecran admin.';

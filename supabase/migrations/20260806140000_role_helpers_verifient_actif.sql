-- ===========================================================================
-- Les helpers de permission RLS verifient desormais `users.actif`
-- (audit #122, constat 3)
-- ===========================================================================
--
-- `is_admin()` testait `role IN ('admin','superadmin')` sans aucun controle sur
-- `actif`. La desactivation d'un compte n'etait donc portee que par
-- `loadAuthProfile` (lib/auth/guards.ts), cote applicatif, et cette branche
-- n'est couverte par aucun test : les 12 fichiers de test qui touchent aux
-- guards les mockent tous. Pour la RLS, un compte desactive restait admin.
--
-- Perimetre reel, releve sur la base de production et non sur le seul constat
-- du rapport : les QUATRE helpers de permission avaient le meme trou, pas
-- seulement `is_admin()`.
--
--   is_admin                  role IN (admin, superadmin)
--   has_pipeline_access       role admin/superadmin OU pipeline_access
--   has_ship_ideas_access     role admin/superadmin OU can_ship_ideas
--   has_validate_ideas_access role admin/superadmin OU can_validate_ideas
--
-- `get_user_role()` n'est PAS touchee volontairement : c'est un accesseur, pas
-- une garde de permission, et plusieurs policies comparent une valeur a son
-- resultat (dont `users_update`, cf 20260806100000). Lui faire renvoyer NULL
-- pour un compte desactive changerait ces comparaisons sans rapport avec le
-- sujet.
--
-- Attenuation qui evitait de classer ce constat critique : `toggleUserActive`
-- revoque les sessions, donc l'exploitation demandait un JWT encore valide
-- capture avant la desactivation. Le trou etait reel mais la fenetre etroite.
--
-- Aucun impact sur les crons ni les scripts : ils utilisent la service_role,
-- qui contourne entierement la RLS.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND actif
      AND role::text IN ('admin', 'superadmin')
  )
$$;

CREATE OR REPLACE FUNCTION public.has_pipeline_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND actif
      AND (role = 'admin' OR role = 'superadmin' OR pipeline_access = true)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_ship_ideas_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND actif
      AND (role = 'admin' OR role = 'superadmin' OR can_ship_ideas = true)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_validate_ideas_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND actif
      AND (role = 'admin' OR role = 'superadmin' OR can_validate_ideas = true)
  )
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Vrai si l''utilisateur courant est un admin ou superadmin ACTIF. Le controle de `actif` est dans la fonction et non seulement cote applicatif : un compte desactive ne doit rien pouvoir lire ni ecrire, meme avec un JWT encore valide.';

COMMIT;

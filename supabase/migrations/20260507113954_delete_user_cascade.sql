-- ---------------------------------------------------------------------------
-- delete_user_cascade : suppression atomique d un user (sprint 5 #5)
-- ---------------------------------------------------------------------------
-- Avant : lib/actions/users.ts:deleteUser executait 7 DELETE/UPDATE
-- sequentiels sur supabase.from(...). Si l'un echouait au milieu, l'etat
-- final etait incoherent (ex. notifications supprimees mais public.users
-- intact). Aucun rollback possible cote SDK.
--
-- Apres : un seul RPC SQL transactionnel qui :
--   1. Supprime les rows attachees a l user (notifications, saisies_temps,
--      client_notes)
--   2. Nullifie les FK de soft-link (projets.cdp_id, projets.backup_cdp_id,
--      factures.created_by, parametres.updated_by)
--   3. Supprime l'entree dans public.users
--
-- L'auth.users est ensuite supprimee cote Server Action via
-- adminClient.auth.admin.deleteUser, dont l erreur est verifiee.
--
-- Garde-fou role : seul un superadmin (role check via is_admin equivalent)
-- peut declencher l'appel. La function est SECURITY DEFINER pour pouvoir
-- toucher aux tables, mais verifie d'abord le role du caller.

CREATE OR REPLACE FUNCTION delete_user_cascade(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- Verifie que le caller (auth.uid()) est superadmin. La Server Action
  -- gate deja via requireSuperAdmin(), c est une ceinture+bretelles
  -- contre une mauvaise utilisation depuis un autre RPC.
  SELECT role::text INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'delete_user_cascade reservee aux superadmins';
  END IF;

  -- Empeche un superadmin de se supprimer lui-meme (la Server Action
  -- verifie deja, on double cote DB).
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Impossible de se supprimer soi-meme';
  END IF;

  -- 1. Cleanup hard-link (CASCADE-able mais on est explicite).
  DELETE FROM notifications WHERE user_id = p_user_id;
  DELETE FROM saisies_temps WHERE user_id = p_user_id;
  DELETE FROM client_notes WHERE user_id = p_user_id;

  -- 2. Soft-link : on conserve les rows mais on libere la reference.
  UPDATE projets SET cdp_id = NULL WHERE cdp_id = p_user_id;
  UPDATE projets SET backup_cdp_id = NULL WHERE backup_cdp_id = p_user_id;
  UPDATE factures SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE parametres SET updated_by = NULL WHERE updated_by = p_user_id;

  -- 3. Public profile (l'auth.users est supprimee separement).
  DELETE FROM users WHERE id = p_user_id;
END;
$$;

-- Grant execute uniquement aux roles utilises par Supabase. RLS sur les
-- tables touchees + le role-check interne assurent l'autorisation reelle.
REVOKE ALL ON FUNCTION delete_user_cascade(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_user_cascade(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION delete_user_cascade(UUID) TO authenticated;

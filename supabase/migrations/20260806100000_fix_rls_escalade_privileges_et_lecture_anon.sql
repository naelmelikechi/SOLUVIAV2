-- ===========================================================================
-- Corrige deux failles RLS relevees par l'audit du 2026-08-06 (issue #122)
-- et confirmees sur la base de PRODUCTION via pg-meta en lecture seule.
-- ===========================================================================
--
-- FAILLE 1 : escalade de privileges vers superadmin (critique)
--   `users_update` etait definie avec USING (is_admin() OR id = auth.uid())
--   et SANS WITH CHECK. Faute de WITH CHECK, Postgres reutilise le USING pour
--   valider la ligne resultante : `id` ne changeant pas, la condition restait
--   vraie apres modification de `role`. Tout utilisateur connecte pouvait donc
--   se promouvoir superadmin (anon et authenticated detiennent le GRANT UPDATE
--   sur public.users, et aucun trigger ne protegeait la colonne).
--   Introduite par 20260511225656_consolidate_multipermissive_policies_lot3.sql.
--
-- FAILLE 2 : lecture sans authentification sur 13 tables
--   13 tables du schema public avaient une policy SELECT permissive
--   (USING true) ouverte au role `public` (donc a `anon`), alors que `anon`
--   detient le GRANT SELECT. La cle anon etant publique (elle part dans le
--   bundle navigateur), ces tables etaient lisibles par n'importe qui, dont
--   `clients`, `client_contacts`, `client_notes`, `client_documents`,
--   `apprenants` et `users`.
--
--   Le seul flux anonyme de l'application est le portail devis
--   (/devis/public/[token], exempte d'auth dans proxy.ts). Il lit ses donnees
--   par la fonction get_devis_public(), qui est SECURITY DEFINER et donc
--   insensible aux policies : ce resserrement ne l'affecte pas. Verifie avant
--   ecriture de cette migration.
--
-- Aucun changement de comportement pour les utilisateurs connectes : les
-- policies visees passent de `public` a `authenticated` en conservant leur
-- clause USING a l'identique.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. public.users : interdire l'escalade de privileges
-- ---------------------------------------------------------------------------

-- RLS ne donne pas acces a OLD : un controle colonne par colonne n'est donc pas
-- exprimable dans une policy. C'est ce trigger qui porte reellement
-- l'invariant ; le WITH CHECK ajoute plus bas n'est qu'une seconde barriere.
CREATE OR REPLACE FUNCTION public.prevent_users_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Contexte serveur de confiance (service_role, migrations, jobs SQL) : pas de
  -- JWT donc pas d'auth.uid(). Ces chemins contournent deja RLS, on les laisse
  -- passer pour ne pas casser les synchronisations cote serveur.
  IF (SELECT auth.uid()) IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION
      'Seul un administrateur peut modifier le role d''un utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.actif IS DISTINCT FROM OLD.actif THEN
    RAISE EXCEPTION
      'Seul un administrateur peut activer ou desactiver un compte'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_users_privilege_escalation() IS
  'Empeche un utilisateur non administrateur de modifier son propre role ou son statut actif. Complete le WITH CHECK de users_update, qui ne peut pas comparer a OLD.';

DROP TRIGGER IF EXISTS trg_users_prevent_privilege_escalation ON public.users;
CREATE TRIGGER trg_users_prevent_privilege_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_users_privilege_escalation();

-- Seconde barriere au niveau RLS. get_user_role() est SECURITY DEFINER STABLE :
-- evaluee sous le snapshot de l'instruction, elle renvoie le role d'AVANT
-- l'UPDATE. Exiger role = get_user_role() interdit donc tout changement de role
-- a un non-admin, meme si le trigger venait a etre desactive.
-- ALTER POLICY (et non DROP/CREATE) pour conserver le USING existant a l'identique.
ALTER POLICY users_update ON public.users
  WITH CHECK (
    public.is_admin()
    OR (
      id = (SELECT auth.uid())
      AND role::text = public.get_user_role()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. public.idees : meme classe de faille, gravite moindre
-- ---------------------------------------------------------------------------
-- idees_update autorise l'auteur a modifier son idee tant qu'elle est
-- 'proposee'. Sans WITH CHECK, il pouvait faire passer `statut` a une autre
-- valeur (s'auto-valider ou s'auto-shipper) ou reattribuer `auteur_id`.
-- On rejoue la meme condition en WITH CHECK : la ligne resultante doit rester
-- la sienne ET rester 'proposee'.
ALTER POLICY idees_update ON public.idees
  WITH CHECK (
    public.is_admin()
    OR public.has_ship_ideas_access()
    OR public.has_validate_ideas_access()
    OR (
      auteur_id = (SELECT auth.uid())
      AND statut = 'proposee'::statut_idee
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Fermer la lecture anonyme sur les 13 tables concernees
-- ---------------------------------------------------------------------------
-- ALTER POLICY ... TO authenticated : on ne retouche pas la clause USING, donc
-- aucun risque d'erreur de recopie et aucun changement pour les connectes.
-- La boucle ne cible que les policies effectivement ouvertes a anon, ce qui
-- rend la migration idempotente (au second passage, plus rien ne matche).
DO $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'SELECT'
      AND (roles::text = '{public}' OR roles::text LIKE '%anon%')
      AND (qual = 'true' OR qual IS NULL)
      AND tablename IN (
        'apprenants', 'axes_temps', 'client_contacts', 'client_documents',
        'client_notes', 'clients', 'echeanciers_templates', 'eduvia_companies',
        'formations', 'idees', 'jours_feries', 'typologies_projet', 'users'
      )
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I TO authenticated',
      r.policyname, r.tablename
    );
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Policies SELECT resserrees de public a authenticated : %', v_count;
END $$;

-- Garde-fou : la migration echoue si l'une des 13 tables reste lisible par anon.
DO $$
DECLARE
  v_restantes TEXT;
BEGIN
  SELECT string_agg(DISTINCT p.tablename, ', ')
    INTO v_restantes
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.cmd = 'SELECT'
    AND (p.roles::text = '{public}' OR p.roles::text LIKE '%anon%')
    AND (p.qual = 'true' OR p.qual IS NULL)
    AND p.tablename IN (
      'apprenants', 'axes_temps', 'client_contacts', 'client_documents',
      'client_notes', 'clients', 'echeanciers_templates', 'eduvia_companies',
      'formations', 'idees', 'jours_feries', 'typologies_projet', 'users'
    );

  IF v_restantes IS NOT NULL THEN
    RAISE EXCEPTION
      'Lecture anonyme toujours ouverte sur : %', v_restantes;
  END IF;
END $$;

COMMIT;

-- ===========================================================================
-- Escalade de privileges : les quatre flags de droits de public.users
-- ===========================================================================
-- Rapport de monitoring du 2026-08-07 (issue #143, constat 1). Critique.
--
-- La migration 20260806100000 a ferme l'escalade sur `role` et `actif`, mais a
-- laisse ouvertes quatre colonnes voisines qui sont, dans ce projet, de
-- veritables droits :
--
--   pipeline_access     -> has_pipeline_access(), qui commande les 9 policies
--                          `for all` du schema crm (comptes, contacts,
--                          opportunites, activites, relances, RDV), plus
--                          document_synthese, signature_requests,
--                          document_templates, cdp_affectation_history,
--                          kpi_snapshots et trois buckets Storage
--   referent_cdp        -> isReferentCdp(), seul controle applicatif avant
--                          applyAffectation(), qui ecrit en service_role donc
--                          RLS contournee : reaffectation libre des clients
--   can_ship_ideas      -> has_ship_ideas_access()
--   can_validate_ideas  -> has_validate_ideas_access()
--
-- Chemin d'exploitation, sans aucune intervention d'un admin : un compte
-- authentifie envoie un PATCH PostgREST direct sur sa propre ligne. `USING`
-- passe (id = auth.uid()), le `WITH CHECK` de users_update passe (`role` est
-- inchange), et le trigger passe (ni `role` ni `actif` ne bougent). La cle anon
-- est publique et le JWT est dans les cookies : la console du navigateur suffit.
-- `proxy.ts` ne peut structurellement pas filtrer, PostgREST vivant sur une
-- autre origine, et aucun trigger d'audit ne trace l'ecriture.
--
-- Correctif : etendre le trigger existant aux quatre colonnes, exactement comme
-- il traite deja `role` et `actif`. On garde une seule barriere pour une seule
-- classe de faute, plutot que d'ajouter un mecanisme concurrent.
--
-- NOTE, non traitee ici car elle demande une introspection des ACL en
-- production : en PostgreSQL, un REVOKE de privilege colonne reste sans effet
-- tant que le role detient le privilege au niveau table. Le REVOKE des champs
-- de cout RH (20260428120000) est donc probablement inoperant lui aussi. A
-- verifier sur la base reelle, hors de portee d'une migration.
-- ---------------------------------------------------------------------------

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

  -- Les quatre flags ci-dessous sont des droits au meme titre que `role` :
  -- s'auto-attribuer pipeline_access ouvre tout le CRM, et referent_cdp permet
  -- de se reaffecter n'importe quel client via un chemin service_role.
  IF NEW.pipeline_access IS DISTINCT FROM OLD.pipeline_access
     OR NEW.referent_cdp IS DISTINCT FROM OLD.referent_cdp
     OR NEW.can_ship_ideas IS DISTINCT FROM OLD.can_ship_ideas
     OR NEW.can_validate_ideas IS DISTINCT FROM OLD.can_validate_ideas THEN
    RAISE EXCEPTION
      'Seul un administrateur peut modifier les droits d''un utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_users_privilege_escalation() IS
  'Empeche un utilisateur non administrateur de modifier son propre role, son statut actif, ou l''un de ses quatre flags de droits (pipeline_access, referent_cdp, can_ship_ideas, can_validate_ideas). Complete le WITH CHECK de users_update, qui ne peut pas comparer a OLD.';

-- Le trigger est deja pose par 20260806100000 et pointe sur cette fonction :
-- CREATE OR REPLACE ci-dessus suffit, rien a recreer.

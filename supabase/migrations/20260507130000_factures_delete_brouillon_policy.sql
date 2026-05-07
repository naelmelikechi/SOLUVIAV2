-- ===========================================================================
-- Add missing DELETE policy on factures (sprint 5 hotfix)
-- ===========================================================================
-- Bug detecte au sprint 6 en ecrivant les tests pgTAP : factures n a aucune
-- policy FOR DELETE. Avec RLS active, DELETE FROM factures retourne 0 rows
-- silencieusement pour TOUS les roles (sauf bypass via service_role).
--
-- Symptome en prod : deleteBrouillon (lib/actions/factures/brouillons.ts)
-- retourne success=true, mais la facture brouillon reste dans la DB. Au
-- reload de l onglet Brouillons, l item reapparait.
--
-- Test reproducteur (sprint 6) :
--   SET LOCAL role authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-id>", ...}', true);
--   DELETE FROM factures WHERE id = '<brouillon-id>'  -- 0 rows
--
-- Fix : ajouter une policy stricte
--   - Seuls admins/superadmins (via is_admin()) peuvent DELETE
--   - Seuls les brouillons (statut='a_emettre') sont supprimables
--     -> preserve la garantie gapless (impossible de delete une facture
--        emise sans crouter un trou dans numero_seq)

CREATE POLICY admin_delete_brouillon_factures ON factures
  FOR DELETE
  USING (statut = 'a_emettre' AND is_admin());

-- Note : on ne donne pas le droit DELETE aux CDP. Si un CDP cree un
-- brouillon par erreur, il doit demander a un admin de le supprimer.
-- Trade-off : moins de droits cote CDP, mais une seule porte d entree
-- pour la suppression = audit logs et controles plus simples.

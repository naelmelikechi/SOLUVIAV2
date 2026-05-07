-- ===========================================================================
-- Test : RLS DELETE policy sur factures (sprint 6)
-- ===========================================================================
-- Spec : un brouillon (statut 'a_emettre') peut etre supprime, une facture
-- emise/payee/avoir non. Cette regle protege la conformite gapless (un trou
-- dans numero_seq apres delete d'une emise).
--
-- Tests :
--   1. DELETE FROM factures WHERE statut = 'a_emettre' -> succes
--   2. DELETE FROM factures WHERE statut = 'emise' -> echec (RLS reject)
--   3. DELETE FROM factures WHERE statut = 'avoir' -> echec (RLS reject)
--   4. Meme un superadmin (auth.uid() = superadmin_id) ne peut pas DELETE
--      une emise, sauf via le helper RPC dedie (a creer)

BEGIN;
SELECT plan(1);

SELECT skip(
  'A implementer : besoin du harness pgTAP + role test pour simuler RLS. '
  'L invariant est documente, le test est squelette. Voir README.md.',
  1
);

SELECT * FROM finish();
ROLLBACK;

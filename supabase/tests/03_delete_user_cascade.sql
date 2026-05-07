-- ===========================================================================
-- Test : delete_user_cascade RPC (sprint 6, lie au sprint 5 #5)
-- ===========================================================================
-- Migration : 20260507120000_delete_user_cascade.sql
--
-- Tests :
--   1. Caller non-superadmin -> RAISE EXCEPTION "reservee aux superadmins"
--   2. Caller superadmin essayant de se supprimer soi-meme -> RAISE
--   3. Caller superadmin avec target valide :
--      - notifications, saisies_temps, client_notes liees au target -> deleted
--      - projets.cdp_id / backup_cdp_id pointant target -> NULL
--      - factures.created_by pointant target -> NULL
--      - parametres.updated_by pointant target -> NULL
--      - public.users du target -> deleted
--   4. Echec partiel (par ex. RAISE manuel sur une etape) -> rollback
--      complet, aucune table modifiee

BEGIN;
SELECT plan(1);

SELECT skip(
  'A implementer : besoin de fixtures users (admin + superadmin + cdp) + '
  'harness pgTAP. L invariant est documente, le test est squelette. '
  'Voir README.md.',
  1
);

SELECT * FROM finish();
ROLLBACK;

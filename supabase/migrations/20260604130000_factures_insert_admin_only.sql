-- F3 (revue facturation) : aligner la RLS d'INSERT factures sur le modele reel
-- "facturation = admin-only".
--
-- Contexte : factures_insert (consolidee en 20260511225439) autorisait aussi le
-- CDP (projets dont il est cdp/backup). Mais l'ecriture facture_lignes /
-- echeances / paiements est admin-only (RLS), donc un CDP ne pouvait jamais
-- produire une facture COMPLETE : il obtenait un echec RLS au milieu de la
-- transaction (rollback), pas un refus propre. Le code applicatif a ete aligne
-- (checkAuth = admin sur toutes les mutations facturation : createFactures,
-- createFactureFromEvents, createBlankBrouillon, deleteBrouillon, sendFacture,
-- createAvoir, CRUD lignes). On retire la branche CDP de factures_insert pour
-- que la RLS soit coherente :
--   - factures_select (lecture admin OU cdp sur ses projets) : INCHANGEE.
--   - ecriture (insert/update/delete) : admin/superadmin uniquement.

DROP POLICY IF EXISTS factures_insert ON public.factures;
CREATE POLICY factures_insert ON public.factures
  FOR INSERT WITH CHECK (public.is_admin());

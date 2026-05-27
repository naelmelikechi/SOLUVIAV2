-- Revert : la migration 20260527140000 partait du principe que les lignes
-- FAC-HEO-0001/0002 etaient jalon-aware (echeancier-driven). Apres analyse,
-- HEOL utilise un modele de facturation different : la commission est calculee
-- sur ce que le CFA a reellement encaisse de l'OPCO (cf billable-events.ts),
-- pas sur le NPEC contractuel × taux × 1/12.
--
-- Le filtre code de loadBilledLines exclut maintenant event_type IS NOT NULL
-- (engagement / opco_step). Pour les lignes FAC-HEO-0002 qui ont event_type
-- NULL mais qui appartiennent au meme modele engagement (emises avant la
-- migration du flow), on les exclut en remettant mois_relatif=0 (le filtre
-- gt('mois_relatif', 0) les ecarte alors).
--
-- Les autres CFA (FORMA QHRC etc.) utilisent le modele echeancier 1/12 NPEC
-- × taux, donc detectNpecChangeAjustement reste valide pour eux.

-- 1. Revert mois_relatif sur les lignes legacy HEOL
UPDATE facture_lignes fl
SET mois_relatif = 0
FROM factures f
WHERE fl.facture_id = f.id
  AND f.ref IN ('FAC-HEO-0001', 'FAC-HEO-0002')
  AND fl.mois_relatif IN (1, 2);

-- 2. Marque comme ignored les 4 pending HEOL : faux positifs du modele
--    engagement detectes par l'ancienne logique pre-fix.
UPDATE facturation_ajustements_pending
SET resolved_at = NOW(),
    resolved_action = 'ignored',
    motif = COALESCE(motif, '') ||
            ' [faux positif modele HEOL/engagement - ignore par migration 20260527150000]'
WHERE id IN (
  '4911c3bc-776b-4659-bb6e-e80015a2c553',
  '08e8c331-cffd-445a-988d-ac36dbbb5938',
  '77283794-2bf7-4bd3-9dbe-d3e2d854aa63',
  '71b2cfaf-62cb-426e-8463-b46f3dbb927e'
);

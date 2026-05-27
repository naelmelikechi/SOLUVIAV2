-- Backfill : assigne mois_relatif distincts aux lignes facture legacy
-- (mois_relatif=0) pour qu'elles soient correctement traitees par la nouvelle
-- detection NPEC groupee par jalon.
--
-- Contexte : avant le passage aux echeancier-templates, les factures
-- FAC-HEO-0001 et FAC-HEO-0002 etaient emises sans rattachement a un jalon
-- (mois_relatif=0). Elles representent en realite 2 milestones distincts :
--   - FAC-HEO-0001 : engagement 40% (taux_snap=40, qp=0.4)
--   - FAC-HEO-0002 : engagement 10% (taux_snap=10, qp=0.1)
--
-- Avec le nouveau code (lib/echeancier/ajustements.ts), le groupement par
-- mois_relatif les ecraserait l'un sur l'autre. On les separe en assignant :
--   - FAC-HEO-0001 lines : mois_relatif=1
--   - FAC-HEO-0002 lines : mois_relatif=2
--
-- Pour les futures factures, le flow normal (createFactures via brouillons.ts)
-- assigne mois_relatif via JalonContribution.mois_relatif (>=1 par validation).

UPDATE facture_lignes fl
SET mois_relatif = 1
FROM factures f
WHERE fl.facture_id = f.id
  AND f.ref = 'FAC-HEO-0001'
  AND fl.mois_relatif = 0
  AND fl.quote_part > 0
  AND fl.npec_snapshot IS NOT NULL;

UPDATE facture_lignes fl
SET mois_relatif = 2
FROM factures f
WHERE fl.facture_id = f.id
  AND f.ref = 'FAC-HEO-0002'
  AND fl.mois_relatif = 0
  AND fl.quote_part > 0
  AND fl.npec_snapshot IS NOT NULL;

-- Persistance OPCO sur la ligne de facture pour :
-- 1. Groupement par OPCO dans le PDF sans rejointure.
-- 2. Analytics : commission par OPCO/mois sans recalcul.
-- 3. Robustesse : si le mapping prefixe->OPCO change apres emission, la facture
--    garde la trace de l'OPCO d'origine.

ALTER TABLE facture_lignes
  ADD COLUMN opco_code TEXT NULL;

CREATE INDEX facture_lignes_opco_code_idx ON facture_lignes (opco_code)
  WHERE opco_code IS NOT NULL;

COMMENT ON COLUMN facture_lignes.opco_code IS
  'OPCO resolu au moment de la creation de la ligne. NULL pour factures libres ou lignes non liees a un contrat.';

-- Backfill (best-effort, non bloquant) : pour les lignes existantes liees a un
-- contrat avec DECA, on resoud via le prefixe et le mapping actuel.
UPDATE facture_lignes fl
SET opco_code = o.code
FROM contrats c, opcos o
WHERE fl.contrat_id = c.id
  AND c.contract_number IS NOT NULL
  AND LEFT(c.contract_number, 3) = ANY (o.prefixes_deca)
  AND o.actif = true
  AND fl.opco_code IS NULL;

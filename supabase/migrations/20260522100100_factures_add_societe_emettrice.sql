-- Phase 1 : ajout factures.societe_emettrice_id. Toutes les factures
-- existantes sont assignees a SOLUVIA (le seul emetteur historique).
-- En deux temps pour respecter NOT NULL apres backfill.

-- 1. Ajout nullable
ALTER TABLE factures
  ADD COLUMN societe_emettrice_id UUID REFERENCES societes_emettrices(id);

-- 2. Backfill SOL pour tout l'existant
UPDATE factures f
   SET societe_emettrice_id = (SELECT id FROM societes_emettrices WHERE code = 'SOL')
 WHERE f.societe_emettrice_id IS NULL;

-- 3. Verification : aucune facture ne doit rester sans societe
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM factures WHERE societe_emettrice_id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplet: % factures sans societe_emettrice_id', v_count;
  END IF;
END $$;

-- 4. Bascule en NOT NULL
ALTER TABLE factures
  ALTER COLUMN societe_emettrice_id SET NOT NULL;

-- 5. Index pour les filtres liste et le join PDF
CREATE INDEX idx_factures_societe_emettrice
  ON factures (societe_emettrice_id);

COMMENT ON COLUMN factures.societe_emettrice_id IS
  'Societe juridique emettrice de la facture (SOLUVIA, DIGIVIA, ...). Trace pour Odoo company mapping et PDF identity.';

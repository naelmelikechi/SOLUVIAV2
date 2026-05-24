-- Drop colonnes redondantes ajoutees pour les factures issues de devis.
-- La source de verite vit dans description + montant_ht + taux_tva_ligne (existants).

ALTER TABLE facture_lignes DROP COLUMN IF EXISTS libelle;
ALTER TABLE facture_lignes DROP COLUMN IF EXISTS quantite;
ALTER TABLE facture_lignes DROP COLUMN IF EXISTS prix_unitaire_ht;
ALTER TABLE facture_lignes DROP COLUMN IF EXISTS total_ht_ligne;
ALTER TABLE facture_lignes DROP COLUMN IF EXISTS total_tva_ligne;
ALTER TABLE facture_lignes DROP COLUMN IF EXISTS total_ttc_ligne;

COMMENT ON COLUMN facture_lignes.description IS 'Description ligne (NOT NULL). Source de verite pour libelle PDF.';
COMMENT ON COLUMN facture_lignes.montant_ht IS 'Montant HT ligne (NOT NULL). Source de verite, recalcul triviaux ailleurs.';
COMMENT ON COLUMN facture_lignes.taux_tva_ligne IS 'Taux TVA % de la ligne (default 20). Necessaire pour PDF + Odoo.';

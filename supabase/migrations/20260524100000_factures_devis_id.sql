-- Phase 3 : lien facture <- devis (origine commerciale) + flag acompte.
-- Permet la transformation devis accepte -> facture(s) et la tracabilite.

ALTER TABLE factures
  ADD COLUMN devis_id UUID REFERENCES devis(id),
  ADD COLUMN est_acompte BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_factures_devis ON factures (devis_id) WHERE devis_id IS NOT NULL;

COMMENT ON COLUMN factures.devis_id IS
  'Devis d''origine si la facture decoule d''un devis accepte (acompte / solde / personnalisee). Null pour les factures projet ou libres.';
COMMENT ON COLUMN factures.est_acompte IS
  'True si la facture represente un acompte (typiquement 50% a la signature du devis). False par defaut.';

-- Colonnes libres pour les lignes issues d'un devis (pas de contrat lie).
-- Nullable pour ne pas casser les lignes existantes lies a un contrat.
ALTER TABLE facture_lignes
  ADD COLUMN libelle          TEXT,
  ADD COLUMN quantite         NUMERIC(10, 2),
  ADD COLUMN prix_unitaire_ht NUMERIC(12, 2),
  ADD COLUMN taux_tva_ligne   NUMERIC(5, 2),
  ADD COLUMN total_ht_ligne   NUMERIC(12, 2),
  ADD COLUMN total_tva_ligne  NUMERIC(12, 2),
  ADD COLUMN total_ttc_ligne  NUMERIC(12, 2),
  ADD COLUMN ordre            INTEGER;

COMMENT ON COLUMN facture_lignes.libelle IS
  'Libelle de la ligne (factures issues d''un devis). NULL pour les lignes contrat/auto.';
COMMENT ON COLUMN facture_lignes.ordre IS
  'Ordre d''affichage de la ligne dans la facture (factures issues d''un devis).';

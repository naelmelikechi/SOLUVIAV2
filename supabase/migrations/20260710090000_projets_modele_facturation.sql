-- Modele de facturation de la commission SOLUVIA, par projet.
--   - 'engagement'  : base = encaissements OPCO (events engagement/opco_step),
--                     facture depuis l'onglet "A l'engagement".
--   - 'echeancier'  : NPEC x taux x quote-part par jalon mensuel (1/12 par
--                     defaut), facture depuis l'onglet "Echeancier".
-- Le flag pilote l'affichage par defaut, il ne cloisonne pas : un projet
-- engagement peut toujours etre facture manuellement et inversement
-- (0016-HEO-APP utilise volontairement les deux modeles).
ALTER TABLE projets
  ADD COLUMN modele_facturation TEXT NOT NULL DEFAULT 'echeancier'
  CONSTRAINT projets_modele_facturation_check
  CHECK (modele_facturation IN ('engagement', 'echeancier'));

COMMENT ON COLUMN projets.modele_facturation IS
  'Modele de commission SOLUVIA : engagement (base = encaissements OPCO) ou echeancier (NPEC x taux x quote-part par jalon).';

-- HEOL facture a l'engagement (modele historique).
UPDATE projets SET modele_facturation = 'engagement'
WHERE client_id IN (SELECT id FROM clients WHERE trigramme = 'HEO');

-- Option pour le paiement de la TVA d'apres les debits (reforme e-invoicing).
-- Par societe emettrice : SOLUVIA / EDUVIA / DIGIVIA peuvent avoir opte
-- differemment aupres de l'administration. Defaut false = etat sur (aucune
-- mention tant que la compta n'a pas confirme).
ALTER TABLE societes_emettrices
  ADD COLUMN tva_sur_debits BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN societes_emettrices.tva_sur_debits IS
  'Si TRUE, la facture porte la mention legale "Option pour le paiement de la taxe d''apres les debits".';

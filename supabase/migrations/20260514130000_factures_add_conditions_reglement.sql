-- Ajoute une colonne conditions_reglement sur factures.
-- Permet d'afficher une mention type "Paiement a reception" sur le PDF,
-- qui rend opposable un delai d'echeance court (vs defaut legal 30j).
ALTER TABLE public.factures ADD COLUMN conditions_reglement TEXT;
COMMENT ON COLUMN public.factures.conditions_reglement IS 'Conditions de reglement affichees sur la facture (ex: "Paiement a reception"). NULL = pas de mention specifique.';

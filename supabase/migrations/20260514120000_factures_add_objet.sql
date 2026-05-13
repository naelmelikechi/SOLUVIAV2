-- Ajoute une colonne objet (libelle de la facture) sur factures.
-- NULL = fallback sur "Commission de gestion - Projet XXX - YYYY-MM" (legacy).
-- Permet de personnaliser le libelle, ex: "Mise en relation commerciale".
ALTER TABLE public.factures ADD COLUMN objet TEXT;
COMMENT ON COLUMN public.factures.objet IS 'Libelle de la facture affiche dans le PDF/UI. NULL = fallback Commission de gestion.';

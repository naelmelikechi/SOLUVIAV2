-- Règlement partiel OPCO (champs Eduvia déployés le 2026-06-11).
--
-- opco_settled_amount = montant réglé par l'OPCO sur l'échéance pédagogique du
-- bordereau. Quand opco_settled_amount >= total_amount du step, le pédago est
-- réglé MÊME SI invoice_state reste 'TRANSMIS' parce que le premier équipement
-- (hors base commission HEOL) n'est pas encore réglé. C'est le signal qui
-- débloque la facturation de la commission sans attendre l'équipement.
--
-- net_invoiced_amount = montant total facturé à l'OPCO (pédago + premier
-- équipement) ; sert de dénominateur d'affichage « X € reçus sur Y € ».
--
-- Nullable : alimentés par la sync depuis GET /api/v1/contracts/:id/invoice_steps.
-- Un step non encore resynchronisé reste NULL (le gate retombe alors sur REGLE).
-- Pas d'index : ces colonnes servent le calcul de la base commission, pas le
-- filtrage indexé.
ALTER TABLE public.eduvia_invoice_steps
  ADD COLUMN IF NOT EXISTS opco_settled_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS net_invoiced_amount NUMERIC;

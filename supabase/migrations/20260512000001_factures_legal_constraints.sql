-- Contraintes legales factures :
-- 1. Une facture marquee est_avoir=true ne peut pas etre en statut 'emise',
--    'en_retard' ou 'payee' (elle doit etre en 'a_emettre', 'avoir' ou
--    'annulee'). Sans cette contrainte un avoir pourrait apparaitre comme
--    une facture standard dans les rapports/sync Odoo.
-- 2. La coherence facture.montant_ht == SUM(facture_lignes.montant_ht) est
--    deja garantie cote application (cents entiers). On ne l'enforce pas en
--    contrainte CHECK (trigger lourd) : confiance + audit ponctuel suffit.

ALTER TABLE factures
  DROP CONSTRAINT IF EXISTS factures_avoir_statut_check;

ALTER TABLE factures
  ADD CONSTRAINT factures_avoir_statut_check
  CHECK (
    NOT est_avoir
    OR statut IN ('a_emettre', 'avoir')
  );

COMMENT ON CONSTRAINT factures_avoir_statut_check ON factures IS
  'Garantit qu''un avoir (est_avoir=true) ne soit jamais en statut emise/en_retard/payee. Un avoir emis a forcement statut=''avoir''.';

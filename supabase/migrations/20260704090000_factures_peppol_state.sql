-- E-invoicing Phase 3 : statut de transmission Peppol des factures.
--
-- Contexte : les factures emises sont poussees vers Odoo (factures.odoo_id).
-- Odoo 19.2 expose account.move.peppol_move_state (module Peppol/PDP) qui
-- reflete le cycle de vie de la transmission electronique : ready, to_send,
-- processing, done, error, submitted, made_available, AB/AP/PD/RE (statuts
-- cycle de vie PDP FR), refused, cancelled. false/vide cote Odoo = jamais
-- transmis -> NULL ici.
--
-- La colonne est alimentee par le pull horaire (pullPayments, lib/odoo/sync.ts)
-- qui lit deja account.move pour l'etat de paiement : on ajoute simplement le
-- champ a la lecture et on persiste quand la valeur change.
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS peppol_state TEXT NULL;

COMMENT ON COLUMN factures.peppol_state IS
  'Statut de transmission e-invoicing (Peppol) lu depuis Odoo (account.move.peppol_move_state). NULL = jamais transmis.';

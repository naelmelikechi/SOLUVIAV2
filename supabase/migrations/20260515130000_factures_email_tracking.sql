-- Observabilite et idempotence des envois email facture.
--   * email_last_attempt_at : derniere tentative d'envoi (succes ou echec).
--   * email_erreur : message d'erreur Resend si echec (NULL si succes).
--
-- Sans ces colonnes, un Resend down se traduit par "rien ne se passe" cote
-- admin : aucun marqueur sur la facture, aucun retry automatique, pas de
-- visibilite. Le couple last_attempt_at + erreur permet a l UI d'afficher
-- l etat (ex. "Echec d'envoi : <raison>") et au cron de relancer en
-- ne retentant pas plus d'une fois toutes les N minutes.

ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS email_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_erreur TEXT;

COMMENT ON COLUMN factures.email_last_attempt_at IS
  'Timestamp de la derniere tentative d''envoi du PDF par email (succes ou echec). NULL = jamais tente.';
COMMENT ON COLUMN factures.email_erreur IS
  'Message d''erreur Resend de la derniere tentative. NULL si la derniere tentative a reussi.';

-- supabase/migrations/20260515100000_users_welcome_email_sent.sql
-- Anti-doublon pour broadcast et envoi auto des emails de bienvenue.
-- NULL = pas encore envoye. Timestamp = envoi reussi.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN users.welcome_email_sent_at IS
  'Date d''envoi reussi du welcome email. NULL = pas encore envoye. Empeche le re-spam lors de broadcasts repetes.';

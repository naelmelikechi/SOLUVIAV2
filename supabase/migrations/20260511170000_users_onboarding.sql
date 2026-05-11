-- Onboarding tour state: timestamp set when the user finishes or skips the
-- guided tour. NULL = pas encore fait. Lu par le shell pour declencher le
-- tour a la 1re connexion (CDP / commercial uniquement).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

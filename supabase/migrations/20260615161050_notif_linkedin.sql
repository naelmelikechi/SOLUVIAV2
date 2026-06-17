-- Notifications du connecteur LinkedIn (Feature 9). ADD VALUE isolé (cf. 00052).
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'linkedin_prospect_cree';
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'linkedin_erreur';

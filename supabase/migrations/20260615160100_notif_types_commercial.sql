-- Nouveaux types de notifications in-app pour le module commercial (pipeline).
-- ADD VALUE isolé (cf. 00052_role_commercial.sql) ; IF NOT EXISTS = idempotent.
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'prospect_rdv_a_venir';
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'prospect_rdv_sans_mail';
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'prospect_sans_activite';

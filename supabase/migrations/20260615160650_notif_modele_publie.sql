-- Notification : publication d'une nouvelle version de modèle (Feature 4 §9).
-- ADD VALUE isolé (cf. 00052) ; IF NOT EXISTS = idempotent.
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'modele_publie';

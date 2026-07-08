-- Garde-fou commercial (Direction 2026-06-09) : alerte immediate quand un taux
-- NPEC < 35 % est saisi sur une opportunite CRM.
-- ALTER TYPE ADD VALUE volontairement SEUL dans sa migration : Postgres refuse
-- d'utiliser une nouvelle valeur d'enum dans la transaction qui l'ajoute.
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'taux_derogatoire';

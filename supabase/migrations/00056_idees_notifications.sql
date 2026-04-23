-- Nouveaux types de notifications pour les idées
-- (ALTER TYPE ADD VALUE doit être dans sa propre transaction)
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'idee_validee';
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'idee_rejetee';
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'idee_implementee';

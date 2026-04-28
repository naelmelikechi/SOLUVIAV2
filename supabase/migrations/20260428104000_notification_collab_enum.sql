-- Nouveau type de notification pour signaler aux admins qu un nouveau
-- collaborateur attend une affectation projet.
-- (ALTER TYPE ADD VALUE doit etre dans sa propre transaction)
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'collaborateur_a_affecter';

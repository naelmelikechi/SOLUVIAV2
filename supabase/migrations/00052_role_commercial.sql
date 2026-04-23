-- Add 'commercial' role for pipeline commercial feature.
-- Must be in its own migration (separate transaction) so that subsequent
-- migrations can reference the new enum value.
ALTER TYPE role_utilisateur ADD VALUE IF NOT EXISTS 'commercial';

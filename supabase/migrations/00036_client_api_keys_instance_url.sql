-- Add instance_url column to client_api_keys
-- Stores the Eduvia instance URL (e.g. "dupont.eduvia.app")
-- NULL allowed for backward compat with existing rows; validated in code
ALTER TABLE client_api_keys ADD COLUMN IF NOT EXISTS instance_url TEXT;

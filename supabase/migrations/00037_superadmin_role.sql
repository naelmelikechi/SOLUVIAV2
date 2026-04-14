-- Add superadmin role to enum (idempotent)
DO $$ BEGIN
  ALTER TYPE role_utilisateur ADD VALUE IF NOT EXISTS 'superadmin';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update is_admin() to include superadmin
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
$$ LANGUAGE sql SECURITY DEFINER;

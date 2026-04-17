-- Add superadmin role to enum (idempotent)
DO $$ BEGIN
  ALTER TYPE role_utilisateur ADD VALUE IF NOT EXISTS 'superadmin';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update is_admin() to include superadmin.
-- NB: we cast role::text to avoid Postgres' "unsafe use of new enum value"
-- error when this migration runs in a single transaction on a fresh DB
-- (the 'superadmin' literal would otherwise be coerced to the enum type
-- inside the same transaction that added the value, which is illegal).
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role::text IN ('admin', 'superadmin'))
$$ LANGUAGE sql SECURITY DEFINER;

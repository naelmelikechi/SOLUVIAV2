-- Add 'commercial' role for pipeline commercial feature
ALTER TYPE role_utilisateur ADD VALUE IF NOT EXISTS 'commercial';

-- Commit the enum change so it's visible in subsequent statements
COMMIT;

-- Helper: check if current user is commercial
CREATE OR REPLACE FUNCTION is_commercial()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'commercial')
$$ LANGUAGE sql SECURITY DEFINER STABLE;

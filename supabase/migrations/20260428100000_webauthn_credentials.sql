-- Stockage des passkeys WebAuthn (Touch ID, Windows Hello, YubiKey, etc.)
-- Un user peut avoir plusieurs passkeys (un par device/authenticator).
CREATE TABLE webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[],
  device_name TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT false,
  device_type TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX webauthn_credentials_user_id_idx ON webauthn_credentials(user_id);

ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Lecture / suppression : uniquement ses propres passkeys
CREATE POLICY "users_select_own_credentials" ON webauthn_credentials
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_delete_own_credentials" ON webauthn_credentials
  FOR DELETE USING (auth.uid() = user_id);

-- L'insertion et la mise à jour du counter passent toujours par le service role
-- (server actions / API routes signées) — pas de policy permissive ici.

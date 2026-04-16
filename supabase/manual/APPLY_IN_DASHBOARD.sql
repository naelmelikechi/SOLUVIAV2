-- =============================================================================
-- SOLUVIA - Migrations à appliquer sur la prod Supabase
-- =============================================================================
-- Dashboard Supabase (projet "soluvia") → SQL Editor → New query → coller tout
-- → Run. Idempotent : peut être re-exécuté sans risque.
-- =============================================================================

-- ------- 00041 : avatar modes (3 états daily / random / frozen) -------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_mode TEXT NOT NULL DEFAULT 'daily'
    CHECK (avatar_mode IN ('daily', 'random', 'frozen'));

UPDATE users
  SET avatar_mode = 'frozen'
  WHERE avatar_seed IS NOT NULL AND avatar_mode = 'daily';

-- ------- 00042 : téléphone utilisateur ---------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS telephone TEXT;

-- ------- 00043 : chat équipe 48h ---------------------------------------------
CREATE TABLE IF NOT EXISTS team_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contenu    TEXT,
  gif_url    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_messages_non_empty CHECK (
    (contenu IS NOT NULL AND length(trim(contenu)) > 0)
    OR (gif_url IS NOT NULL AND length(trim(gif_url)) > 0)
  ),
  CONSTRAINT team_messages_contenu_max CHECK (
    contenu IS NULL OR length(contenu) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS idx_team_messages_created_at
  ON team_messages(created_at DESC);

ALTER TABLE team_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_messages_select ON team_messages;
CREATE POLICY team_messages_select ON team_messages
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS team_messages_insert ON team_messages;
CREATE POLICY team_messages_insert ON team_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS team_messages_delete ON team_messages;
CREATE POLICY team_messages_delete ON team_messages
  FOR DELETE USING (auth.uid() = user_id);

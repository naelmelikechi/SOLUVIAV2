-- Chat d'équipe éphémère - messages auto-supprimés au bout de 48h.
-- - TTL géré par un cron (voir app/api/cron/chat-cleanup)
-- - Giphy URLs stockées telles quelles (gif_url). Pas d'upload, pas d'images/vidéos.
-- - Chaque utilisateur peut supprimer ses propres messages (annulation d'envoi).

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

-- Tout utilisateur authentifié voit tous les messages.
CREATE POLICY team_messages_select ON team_messages
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Chacun n'insère que ses propres messages.
CREATE POLICY team_messages_insert ON team_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Chacun ne supprime que ses propres messages (annulation d'envoi).
CREATE POLICY team_messages_delete ON team_messages
  FOR DELETE
  USING (auth.uid() = user_id);

-- Permet d associer une notification a un utilisateur "sujet" (par exemple
-- un nouveau collaborateur qui attend une affectation). Sert au trigger
-- d auto-resolve qui marque la notification comme lue quand l user sujet
-- recoit son premier projet client.

ALTER TABLE notifications
  ADD COLUMN subject_user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX idx_notifications_subject_user
  ON notifications(subject_user_id)
  WHERE subject_user_id IS NOT NULL AND read_at IS NULL;

-- Trigger d auto-resolve : quand un projet client (non interne, non archive,
-- statut actif) recoit un cdp_id ou backup_cdp_id, marque comme lues toutes
-- les notifications 'collaborateur_a_affecter' qui ciblent cet user.
CREATE OR REPLACE FUNCTION resolve_collaborateur_a_affecter()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.est_interne = true OR NEW.archive = true THEN
    RETURN NEW;
  END IF;

  IF NEW.cdp_id IS NOT NULL THEN
    UPDATE notifications
       SET read_at = now()
     WHERE type::text = 'collaborateur_a_affecter'
       AND subject_user_id = NEW.cdp_id
       AND read_at IS NULL;
  END IF;

  IF NEW.backup_cdp_id IS NOT NULL THEN
    UPDATE notifications
       SET read_at = now()
     WHERE type::text = 'collaborateur_a_affecter'
       AND subject_user_id = NEW.backup_cdp_id
       AND read_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_resolve_collab_a_affecter
  AFTER INSERT OR UPDATE OF cdp_id, backup_cdp_id ON projets
  FOR EACH ROW EXECUTE FUNCTION resolve_collaborateur_a_affecter();

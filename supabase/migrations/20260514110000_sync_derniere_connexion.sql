-- Synchronise auth.users.last_sign_in_at -> public.users.derniere_connexion.
-- Resout le bug M3 du rapport de test (champ jamais renseigne dans la table publique).

CREATE OR REPLACE FUNCTION public.sync_derniere_connexion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at
     AND NEW.last_sign_in_at IS NOT NULL THEN
    UPDATE public.users
    SET derniere_connexion = NEW.last_sign_in_at
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_derniere_connexion ON auth.users;
CREATE TRIGGER trg_sync_derniere_connexion
AFTER UPDATE OF last_sign_in_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_derniere_connexion();

-- Backfill : recupere les dernieres connexions deja enregistrees par Supabase Auth
-- mais jamais propagees vers public.users.
UPDATE public.users u
SET derniere_connexion = a.last_sign_in_at
FROM auth.users a
WHERE a.id = u.id
  AND a.last_sign_in_at IS NOT NULL
  AND (u.derniere_connexion IS NULL OR u.derniere_connexion < a.last_sign_in_at);

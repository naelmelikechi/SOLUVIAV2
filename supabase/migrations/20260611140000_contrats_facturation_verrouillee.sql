-- Verrou de facturation manuel (decision humaine, cote SOLUVIA, hors Eduvia).
--
-- Un contrat verrouille reste VISIBLE dans la vue facturable mais n'est jamais
-- selectionnable (status 'locked', lock_reason 'verrouille_manuel') tant que le
-- drapeau est true. Sert aux cas particuliers traites plus tard (ex. litige,
-- contrat hors-norme) sans devoir l'archiver ni le masquer.
--
-- Colonne SOLUVIA pure : la sync Eduvia ne la touche pas (absente du payload
-- d'upsert), donc le verrou persiste a travers les resynchronisations.
ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS facturation_verrouillee BOOLEAN NOT NULL DEFAULT false;

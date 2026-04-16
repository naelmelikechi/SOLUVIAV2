-- Avatar modes refonte: 3 états explicites (daily / random / frozen)
--   - daily:  avatar change chaque jour (seed calculé à la volée, colonne avatar_seed ignorée)
--   - random: tirage aléatoire du jour (avatar_seed = seed random, avatar_regen_date = date du tirage,
--             expire automatiquement au changement de jour → redevient daily à l'affichage)
--   - frozen: avatar figé (avatar_seed = seed figé, permanent jusqu'à déverrouillage)
--
-- avatar_regen_date sert à la fois de date de tirage courant (expiry du random) et de rate-limit
-- (1 seul tirage aléatoire par jour).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_mode TEXT NOT NULL DEFAULT 'daily'
    CHECK (avatar_mode IN ('daily', 'random', 'frozen'));

-- Migration des comptes existants : tous les utilisateurs actuellement "lockés"
-- (avatar_seed non-null) passent en mode frozen.
UPDATE users
  SET avatar_mode = 'frozen'
  WHERE avatar_seed IS NOT NULL
    AND avatar_mode = 'daily';

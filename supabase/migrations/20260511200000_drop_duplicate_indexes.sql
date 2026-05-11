-- Drop indexes dupliques identifies par le Supabase advisor (lint 0009).
--
-- Pair 1 : idx_notifications_user_read == idx_notifications_user_unread
--          (meme btree (user_id, read_at) WHERE read_at IS NULL)
--   On garde idx_notifications_user_unread (nom plus precis, matche le predicat).
--   00039_additional_indexes.sql avait cree idx_notifications_user_read en
--   doublon de l index originel ailleurs.
--
-- Pair 2 : idx_saisies_temps_user_date == idx_saisies_user_date
--          (meme btree (user_id, date))
--   On garde idx_saisies_temps_user_date (prefixe match la table).
--   00031_indexes.sql avait cree idx_saisies_user_date avant que le prefixe
--   complet soit standardise.

DROP INDEX IF EXISTS public.idx_notifications_user_read;
DROP INDEX IF EXISTS public.idx_saisies_user_date;

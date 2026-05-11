-- Move pg_trgm de public vers extensions (resout advisor 0014).
-- Verifie au prealable : aucun index ne reference gin_trgm_ops, aucune
-- fonction applicative n'utilise similarity()/%/word_similarity. Safe.

ALTER EXTENSION pg_trgm SET SCHEMA extensions;


-- Move pg_trgm de public vers extensions (advisor 0014). Aucun index ni
-- code applicatif n'utilise pg_trgm actuellement, donc move safe.
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

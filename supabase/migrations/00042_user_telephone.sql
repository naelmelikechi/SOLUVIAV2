-- Ajout du téléphone sur les utilisateurs (page Équipe / contacts internes).
-- Optionnel, format libre pour supporter numéros internationaux et extensions.
ALTER TABLE users ADD COLUMN IF NOT EXISTS telephone TEXT;

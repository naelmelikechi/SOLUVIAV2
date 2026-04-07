-- Users table: id must match auth.users.id
-- Role stored in table, NOT in JWT claims (spec 00)
CREATE TABLE users (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email              TEXT UNIQUE NOT NULL,
  nom                TEXT NOT NULL,
  prenom             TEXT NOT NULL,
  role               role_utilisateur NOT NULL DEFAULT 'cdp',
  actif              BOOLEAN NOT NULL DEFAULT true,
  derniere_connexion TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

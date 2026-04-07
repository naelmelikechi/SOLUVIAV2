-- System settings (key-value store)
CREATE TABLE parametres (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cle         TEXT UNIQUE NOT NULL,
  valeur      TEXT NOT NULL,
  categorie   TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id)
);

-- Bank holidays
CREATE TABLE jours_feries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE UNIQUE NOT NULL,
  libelle    TEXT NOT NULL,
  annee      INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

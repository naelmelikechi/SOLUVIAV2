-- Project typologies (admin-managed)
CREATE TABLE typologies_projet (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT UNIQUE NOT NULL,
  libelle    TEXT NOT NULL,
  actif      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Time tracking axes (reference table)
CREATE TABLE axes_temps (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code    TEXT UNIQUE NOT NULL,
  libelle TEXT NOT NULL,
  couleur TEXT,
  ordre   INTEGER NOT NULL DEFAULT 0
);

-- Projects
CREATE TABLE projets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref              TEXT UNIQUE,
  client_id        UUID NOT NULL REFERENCES clients(id),
  typologie_id     UUID NOT NULL REFERENCES typologies_projet(id),
  cdp_id           UUID REFERENCES users(id),
  backup_cdp_id    UUID REFERENCES users(id),
  statut           statut_projet NOT NULL DEFAULT 'actif',
  date_debut       DATE,
  taux_commission  NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  est_absence      BOOLEAN NOT NULL DEFAULT false,
  archive          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_cdp_different CHECK (cdp_id IS DISTINCT FROM backup_cdp_id)
);

-- Quality tasks (synced from Eduvia)
CREATE TABLE taches_qualite (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eduvia_id      INTEGER UNIQUE,
  projet_id      UUID NOT NULL REFERENCES projets(id),
  famille_code   TEXT NOT NULL,
  famille_libelle TEXT,
  indicateur     TEXT,
  livrable       TEXT,
  fait           BOOLEAN NOT NULL DEFAULT false,
  date_echeance  DATE,
  eduvia_url     TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

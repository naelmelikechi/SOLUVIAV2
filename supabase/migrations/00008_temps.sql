-- Time entries
CREATE TABLE saisies_temps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  projet_id  UUID NOT NULL REFERENCES projets(id),
  date       DATE NOT NULL,
  heures     NUMERIC(4,2) NOT NULL CHECK (heures >= 0 AND heures <= 7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_saisie_user_projet_date UNIQUE (user_id, projet_id, date)
);

-- Time entry axis breakdown
CREATE TABLE saisies_temps_axes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saisie_id UUID NOT NULL REFERENCES saisies_temps(id) ON DELETE CASCADE,
  axe       TEXT NOT NULL,
  heures    NUMERIC(4,2) NOT NULL CHECK (heures >= 0),

  CONSTRAINT uq_saisie_axe UNIQUE (saisie_id, axe)
);

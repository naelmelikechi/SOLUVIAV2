-- Contracts (synced from Eduvia -- read-only in SOLUVIA)
CREATE TABLE contrats (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                      TEXT UNIQUE,
  eduvia_id                INTEGER UNIQUE NOT NULL,
  projet_id                UUID NOT NULL REFERENCES projets(id),
  apprenant_nom            TEXT,
  apprenant_prenom         TEXT,
  formation_titre          TEXT,
  date_debut               DATE,
  date_fin                 DATE,
  contract_state           TEXT NOT NULL DEFAULT 'actif',
  montant_prise_en_charge  NUMERIC(12,2),
  duree_mois               INTEGER,
  archive                  BOOLEAN NOT NULL DEFAULT false,
  last_synced_at           TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Learners (synced from Eduvia)
CREATE TABLE apprenants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eduvia_id      INTEGER UNIQUE NOT NULL,
  nom            TEXT,
  prenom         TEXT,
  email          TEXT,
  contrat_id     UUID REFERENCES contrats(id),
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Formations (synced from Eduvia)
CREATE TABLE formations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eduvia_id      INTEGER UNIQUE NOT NULL,
  titre          TEXT,
  duree          TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eduvia companies (mapped to SOLUVIA clients)
CREATE TABLE eduvia_companies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eduvia_id      INTEGER UNIQUE NOT NULL,
  client_id      UUID REFERENCES clients(id),
  name           TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

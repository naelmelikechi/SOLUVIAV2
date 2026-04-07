-- Clients
CREATE TABLE clients (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigramme                TEXT UNIQUE NOT NULL,
  raison_sociale           TEXT NOT NULL,
  siret                    TEXT,
  adresse                  TEXT,
  localisation             TEXT,
  tva_intracommunautaire   TEXT,
  numero_qualiopi          TEXT,
  numero_nda               TEXT,
  numero_uai               TEXT,
  date_entree              DATE,
  archive                  BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Client contacts
CREATE TABLE client_contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nom        TEXT NOT NULL,
  poste      TEXT,
  email      TEXT,
  telephone  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Client Eduvia API keys (encrypted)
CREATE TABLE client_api_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  api_key_encrypted TEXT NOT NULL,
  label             TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_sync_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Client notes (CRM journal)
CREATE TABLE client_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  contenu    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Client documents
CREATE TABLE client_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  nom_fichier   TEXT NOT NULL,
  type_document TEXT,
  storage_path  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invoices (NO DELETE allowed -- French legal requirement)
CREATE TABLE factures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                 TEXT UNIQUE,
  numero_seq          INTEGER,
  projet_id           UUID NOT NULL REFERENCES projets(id),
  client_id           UUID NOT NULL REFERENCES clients(id),
  date_emission       DATE,
  date_echeance       DATE,
  mois_concerne       TEXT,
  montant_ht          NUMERIC(12,2) NOT NULL,
  taux_tva            NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  montant_tva         NUMERIC(12,2) NOT NULL,
  montant_ttc         NUMERIC(12,2) NOT NULL,
  statut              statut_facture NOT NULL DEFAULT 'a_emettre',
  est_avoir           BOOLEAN NOT NULL DEFAULT false,
  avoir_motif         TEXT,
  facture_origine_id  UUID REFERENCES factures(id),
  odoo_id             TEXT,
  pdf_url             TEXT,
  email_envoye        BOOLEAN NOT NULL DEFAULT false,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_avoir_motif CHECK (
    (est_avoir = false) OR (avoir_motif IS NOT NULL AND facture_origine_id IS NOT NULL)
  )
);

-- Invoice line items
CREATE TABLE facture_lignes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id  UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  contrat_id  UUID NOT NULL REFERENCES contrats(id),
  description TEXT NOT NULL,
  montant_ht  NUMERIC(12,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payments (synced from Odoo or manual)
CREATE TABLE paiements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id       UUID NOT NULL REFERENCES factures(id),
  montant          NUMERIC(12,2) NOT NULL,
  date_reception   DATE NOT NULL,
  odoo_id          TEXT,
  saisie_manuelle  BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invoice schedule (planned invoices per project/month)
CREATE TABLE echeances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id           UUID NOT NULL REFERENCES projets(id),
  mois_concerne       DATE NOT NULL,
  date_emission_prevue DATE NOT NULL,
  montant_prevu_ht    NUMERIC(12,2) NOT NULL,
  facture_id          UUID REFERENCES factures(id),
  validee             BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_echeance_projet_mois UNIQUE (projet_id, mois_concerne)
);

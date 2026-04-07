-- Monthly production (synced/calculated)
CREATE TABLE production_mensuelle (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id            UUID NOT NULL REFERENCES projets(id),
  mois                 DATE NOT NULL,
  production_opco      NUMERIC(12,2) NOT NULL DEFAULT 0,
  facture_opco         NUMERIC(12,2) NOT NULL DEFAULT 0,
  encaisse_opco        NUMERIC(12,2) NOT NULL DEFAULT 0,
  production_soluvia   NUMERIC(12,2) NOT NULL DEFAULT 0,
  facture_soluvia      NUMERIC(12,2) NOT NULL DEFAULT 0,
  encaisse_soluvia     NUMERIC(12,2) NOT NULL DEFAULT 0,
  en_retard            NUMERIC(12,2) NOT NULL DEFAULT 0,
  reste_a_facturer     NUMERIC(12,2) NOT NULL DEFAULT 0,
  reste_a_encaisser    NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_synced_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_production_projet_mois UNIQUE (projet_id, mois)
);

-- Contract-level financial data (from Eduvia)
CREATE TABLE donnees_financieres (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id          UUID NOT NULL REFERENCES contrats(id),
  projet_id           UUID NOT NULL REFERENCES projets(id),
  montant_contrat     NUMERIC(12,2),
  duree_reelle_mois   INTEGER,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

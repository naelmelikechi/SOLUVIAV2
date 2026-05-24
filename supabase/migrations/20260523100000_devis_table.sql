-- Phase 2 : table devis (document commercial pre-facture).
-- Numerotation par societe emettrice, allouee a la premiere transition
-- vers 'envoye'. Brouillons sans ref (peuvent etre supprimes sans trou
-- contrairement aux factures qui sont gapless legales).

CREATE TYPE statut_devis AS ENUM (
  'brouillon',
  'envoye',
  'accepte',
  'refuse',
  'expire',
  'remplace',
  'annule'
);

CREATE TABLE devis (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                         TEXT UNIQUE,
  numero_seq                  INTEGER,
  societe_emettrice_id        UUID NOT NULL REFERENCES societes_emettrices(id),
  client_id                   UUID NOT NULL REFERENCES clients(id),
  statut                      statut_devis NOT NULL DEFAULT 'brouillon',
  objet                       TEXT NOT NULL,
  date_emission               DATE,
  date_validite               DATE,
  date_envoi                  TIMESTAMPTZ,
  date_acceptation            TIMESTAMPTZ,
  date_refus                  TIMESTAMPTZ,
  montant_ht                  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  montant_tva                 NUMERIC(12, 2) NOT NULL DEFAULT 0,
  montant_ttc                 NUMERIC(12, 2) NOT NULL DEFAULT 0,
  acceptation_token           TEXT UNIQUE,
  acceptation_token_expire_at TIMESTAMPTZ,
  acceptation_nom             TEXT,
  acceptation_email           TEXT,
  acceptation_ip              INET,
  acceptation_user_agent      TEXT,
  refus_motif                 TEXT,
  conditions_reglement        TEXT,
  notes_internes              TEXT,
  devis_parent_id             UUID REFERENCES devis(id),
  version                     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  relances_actives            BOOLEAN NOT NULL DEFAULT TRUE,
  relance_j7_envoyee_at       TIMESTAMPTZ,
  relance_j14_envoyee_at      TIMESTAMPTZ,
  pdf_url                     TEXT,
  pdf_locked                  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by                  UUID REFERENCES users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_devis_montants_positifs CHECK (
    montant_ht >= 0 AND montant_tva >= 0 AND montant_ttc >= 0
  ),
  CONSTRAINT chk_devis_ttc_coherent CHECK (montant_ttc >= montant_ht),
  CONSTRAINT chk_devis_seq_required_when_sent CHECK (
    (statut = 'brouillon' AND numero_seq IS NULL AND ref IS NULL)
    OR (statut != 'brouillon' AND numero_seq IS NOT NULL AND ref IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_devis_numero_seq_par_societe
  ON devis (societe_emettrice_id, numero_seq)
  WHERE numero_seq IS NOT NULL;

CREATE INDEX idx_devis_societe_statut ON devis (societe_emettrice_id, statut);
CREATE INDEX idx_devis_client ON devis (client_id);
CREATE INDEX idx_devis_acceptation_token ON devis (acceptation_token) WHERE acceptation_token IS NOT NULL;
CREATE INDEX idx_devis_parent ON devis (devis_parent_id) WHERE devis_parent_id IS NOT NULL;
CREATE INDEX idx_devis_envoye_relance ON devis (statut, date_envoi) WHERE statut = 'envoye';

CREATE TRIGGER trg_devis_updated_at
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE devis ENABLE ROW LEVEL SECURITY;

CREATE POLICY devis_admin_all ON devis FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role() IN ('admin', 'superadmin'));

COMMENT ON TABLE devis IS
  'Documents commerciaux pre-facture. Numerotation par societe emettrice, allouee a l envoi. Cycle brouillon -> envoye -> accepte/refuse/expire/remplace/annule. Admin only via RLS.';

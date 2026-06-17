-- RDV commerciaux enrichis (Feature 3) : type de RDV (tunnel 4 RDV), format,
-- participants, compte-rendu, suivi du mail post-RDV.

CREATE TYPE type_rdv AS ENUM (
  'presentation',
  'cadrage',
  'audit_tunnel_a',
  'audit_tunnel_b',
  'signature',
  'autre'
);
CREATE TYPE format_rdv AS ENUM (
  'presentiel',
  'visio_meet',
  'visio_zoom',
  'visio_teams',
  'telephone'
);

ALTER TABLE rdv_commerciaux
  ADD COLUMN IF NOT EXISTS type_rdv              type_rdv NOT NULL DEFAULT 'autre',
  ADD COLUMN IF NOT EXISTS format                format_rdv,
  ADD COLUMN IF NOT EXISTS lieu                  TEXT,
  ADD COLUMN IF NOT EXISTS duree_min             INTEGER,
  -- Participants : ids d'interlocuteurs (prospect_contacts) et d'users (Soluvia).
  ADD COLUMN IF NOT EXISTS participants_prospect UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS participants_soluvia  UUID[] NOT NULL DEFAULT '{}',
  -- Compte-rendu unique (Feature 3 §4) + version du gabarit chargé (figé).
  ADD COLUMN IF NOT EXISTS compte_rendu          TEXT,
  ADD COLUMN IF NOT EXISTS cr_finalise           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gabarit_version       TEXT,
  -- Statut "Soldé" dérivé : non null = mail post-RDV envoyé (Feature 3 §6/§7).
  ADD COLUMN IF NOT EXISTS mail_post_envoye_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rdv_commerciaux_type ON rdv_commerciaux(type_rdv);

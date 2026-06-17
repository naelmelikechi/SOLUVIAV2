-- Feature 9 — Connecteur LinkedIn → pipeline.
-- Récepteur d'évènements de l'outil de prospection LinkedIn : crée/enrichit une
-- fiche prospect (matching SIREN/raison sociale via find_prospect_duplicates,
-- round-robin ou règle de mapping). DORMANT tant que l'outil source n'est pas
-- branché : le webhook (app/api/webhooks/linkedin) s'authentifie par
-- LINKEDIN_WEBHOOK_SECRET et accepte un contrat JSON documenté (le mapping exact
-- au payload de l'outil sera ajusté quand l'éditeur sera choisi).

CREATE TYPE type_evenement_linkedin AS ENUM (
  'reponse_positive',
  'connexion_acceptee',
  'mention_interet',
  'rdv_demande'
);
CREATE TYPE statut_evenement_linkedin AS ENUM (
  'nouveau',
  'traite',
  'ignore',
  'erreur'
);

CREATE TABLE linkedin_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outil_source          TEXT,
  type_evenement        type_evenement_linkedin NOT NULL,
  linkedin_profil_url   TEXT,
  linkedin_company_url  TEXT,
  linkedin_company_name TEXT,
  prenom_nom            TEXT,
  fonction              TEXT,
  contenu_message       TEXT,
  date_evenement        TIMESTAMPTZ,
  prospect_cree_id      UUID REFERENCES prospects(id) ON DELETE SET NULL,
  interlocuteur_cree_id UUID REFERENCES prospect_contacts(id) ON DELETE SET NULL,
  statut                statut_evenement_linkedin NOT NULL DEFAULT 'nouveau',
  raison_ignore         TEXT,
  traite_le             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_linkedin_events_statut ON linkedin_events(statut);
CREATE INDEX idx_linkedin_events_prospect ON linkedin_events(prospect_cree_id);
-- Détection de doublons d'évènement (même profil < 7 jours) : index de recherche.
CREATE INDEX idx_linkedin_events_profil ON linkedin_events(linkedin_profil_url);

CREATE TABLE linkedin_mapping_rules (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linkedin_company_pattern TEXT NOT NULL,
  developpeur_affecte_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  priorite                INTEGER NOT NULL DEFAULT 100,
  actif                   BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE linkedin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_mapping_rules ENABLE ROW LEVEL SECURITY;

-- Évènements : lecture pipeline+admin (le webhook écrit en service-role).
CREATE POLICY linkedin_events_select ON linkedin_events
  FOR SELECT TO public USING (((SELECT is_admin()) OR has_pipeline_access()));
CREATE POLICY linkedin_events_insert ON linkedin_events
  FOR INSERT TO public WITH CHECK (is_admin());
CREATE POLICY linkedin_events_update ON linkedin_events
  FOR UPDATE TO public USING (is_admin());
CREATE POLICY linkedin_events_delete ON linkedin_events
  FOR DELETE TO public USING (is_admin());

-- Règles de mapping : Direction seule.
CREATE POLICY linkedin_mapping_rules_select ON linkedin_mapping_rules
  FOR SELECT TO public USING (((SELECT is_admin()) OR has_pipeline_access()));
CREATE POLICY linkedin_mapping_rules_insert ON linkedin_mapping_rules
  FOR INSERT TO public WITH CHECK (is_admin());
CREATE POLICY linkedin_mapping_rules_update ON linkedin_mapping_rules
  FOR UPDATE TO public USING (is_admin());
CREATE POLICY linkedin_mapping_rules_delete ON linkedin_mapping_rules
  FOR DELETE TO public USING (is_admin());

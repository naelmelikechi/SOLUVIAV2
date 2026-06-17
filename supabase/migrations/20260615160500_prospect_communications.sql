-- Historique des communications du prospect (onglet 4 Feature 2). Trace les
-- mails envoyés depuis Soluvia (post-RDV + manuels). La réception via webmail
-- est hors périmètre V1 (intégration à arbitrer ultérieurement).
CREATE TABLE prospect_communications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  sujet        TEXT,
  destinataire TEXT,
  rdv_id       UUID REFERENCES rdv_commerciaux(id) ON DELETE SET NULL,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prospect_communications_prospect
  ON prospect_communications(prospect_id);

ALTER TABLE prospect_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospect_communications_select ON prospect_communications
  FOR SELECT TO public USING (((SELECT is_admin()) OR has_pipeline_access()));
CREATE POLICY prospect_communications_insert ON prospect_communications
  FOR INSERT TO public WITH CHECK ((is_admin() OR has_pipeline_access()));
CREATE POLICY prospect_communications_update ON prospect_communications
  FOR UPDATE TO public USING ((is_admin() OR has_pipeline_access()));
CREATE POLICY prospect_communications_delete ON prospect_communications
  FOR DELETE TO public USING (is_admin());

-- Feature 6 — Document de synthèse de passation (Développeur → CDP), généré à la
-- signature du contrat. Diffusion en 2 vagues : (1) Référent CDP + Direction
-- (document complet, 8 sections), (2) CDP affecté (sans la section 8 « notes
-- internes / vigilance »). Génération PDF côté app (react-pdf), snapshot des
-- sections figé dans `contenu`.

CREATE TYPE statut_synthese AS ENUM (
  'generee',
  'diffusee_vague1',
  'diffusee_vague2',
  'archivee'
);

CREATE TABLE document_synthese (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id       UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  signature_id      UUID REFERENCES signature_requests(id) ON DELETE SET NULL,
  statut            statut_synthese NOT NULL DEFAULT 'generee',
  contenu           JSONB,
  pdf_path_complet  TEXT,
  pdf_path_cdp      TEXT,
  genere_par        UUID REFERENCES users(id) ON DELETE SET NULL,
  diffuse_vague1_at TIMESTAMPTZ,
  diffuse_vague2_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_synthese_prospect ON document_synthese(prospect_id);

CREATE TRIGGER trg_document_synthese_updated
  BEFORE UPDATE ON document_synthese
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE document_synthese ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_synthese_select ON document_synthese
  FOR SELECT TO public USING (((SELECT is_admin()) OR has_pipeline_access()));
CREATE POLICY document_synthese_insert ON document_synthese
  FOR INSERT TO public WITH CHECK ((is_admin() OR has_pipeline_access()));
CREATE POLICY document_synthese_update ON document_synthese
  FOR UPDATE TO public USING ((is_admin() OR has_pipeline_access()));
CREATE POLICY document_synthese_delete ON document_synthese
  FOR DELETE TO public USING (is_admin());

-- Bucket privé des synthèses de passation.
INSERT INTO storage.buckets (id, name, public)
VALUES ('passation-documents', 'passation-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pipeline_write_passation_documents" ON storage.objects;
CREATE POLICY "pipeline_write_passation_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'passation-documents' AND (is_admin() OR has_pipeline_access())
  );
DROP POLICY IF EXISTS "pipeline_read_passation_documents" ON storage.objects;
CREATE POLICY "pipeline_read_passation_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'passation-documents' AND (is_admin() OR has_pipeline_access())
  );
DROP POLICY IF EXISTS "admin_delete_passation_documents" ON storage.objects;
CREATE POLICY "admin_delete_passation_documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'passation-documents' AND is_admin());

-- Feature 4 — Bibliothèque de modèles : centralisation + versioning des modèles
-- documentaires (présentation, BP, contrat-cadre, synthèse, AlternaRH).
-- Seule la Direction (is_admin) publie une version ; toutes les versions sont
-- conservées (immuables), une seule 'active' par modèle.

CREATE TABLE document_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  nom         TEXT NOT NULL,
  description TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_template_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  fichier_nom  TEXT,
  notes        TEXT,
  active       BOOLEAN NOT NULL DEFAULT false,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
CREATE INDEX idx_dtv_template ON document_template_versions(template_id);
-- Une seule version active par modèle (le défaut proposé à la génération).
CREATE UNIQUE INDEX uq_dtv_active
  ON document_template_versions(template_id) WHERE active;

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_template_versions ENABLE ROW LEVEL SECURITY;

-- Lecture : pipeline + admin (is_admin hoisté en InitPlan). Écriture : admin seul.
CREATE POLICY document_templates_select ON document_templates
  FOR SELECT TO public USING (((SELECT is_admin()) OR has_pipeline_access()));
CREATE POLICY document_templates_insert ON document_templates
  FOR INSERT TO public WITH CHECK (is_admin());
CREATE POLICY document_templates_update ON document_templates
  FOR UPDATE TO public USING (is_admin());
CREATE POLICY document_templates_delete ON document_templates
  FOR DELETE TO public USING (is_admin());

CREATE POLICY dtv_select ON document_template_versions
  FOR SELECT TO public USING (((SELECT is_admin()) OR has_pipeline_access()));
CREATE POLICY dtv_insert ON document_template_versions
  FOR INSERT TO public WITH CHECK (is_admin());
CREATE POLICY dtv_update ON document_template_versions
  FOR UPDATE TO public USING (is_admin());
CREATE POLICY dtv_delete ON document_template_versions
  FOR DELETE TO public USING (is_admin());

-- Bucket privé des fichiers modèles (accès via signed URL).
INSERT INTO storage.buckets (id, name, public)
VALUES ('commercial-templates', 'commercial-templates', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admin_write_commercial_templates" ON storage.objects;
CREATE POLICY "admin_write_commercial_templates" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'commercial-templates' AND is_admin());

DROP POLICY IF EXISTS "pipeline_read_commercial_templates" ON storage.objects;
CREATE POLICY "pipeline_read_commercial_templates" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'commercial-templates' AND (is_admin() OR has_pipeline_access())
  );

DROP POLICY IF EXISTS "admin_delete_commercial_templates" ON storage.objects;
CREATE POLICY "admin_delete_commercial_templates" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'commercial-templates' AND is_admin());

-- Seed des 5 emplacements de modèles fichiers (la Direction y publiera les
-- versions ; les mails-types et gabarits de notes restent gérés en code, F3).
INSERT INTO document_templates (code, nom, description, ordre) VALUES
  ('presentation_pptx', 'Présentation Soluvia (PPTX)',
   'Support de présentation commerciale.', 1),
  ('business_plan_xlsx', 'Business plan 3 ans (XLSX)',
   'Modèle de budget prévisionnel sur 3 ans.', 2),
  ('contrat_cadre_docx', 'Contrat-cadre (DOCX)',
   'Contrat-cadre Soluvia / CFA (validé par l''avocate dédiée).', 3),
  ('synthese_passation', 'Document de synthèse de passation',
   'Trame de passation Développeur vers CDP (8 sections).', 4),
  ('alternarh_xlsx', 'Modèle AlternaRH (XLSX)',
   'Fichier collaborateurs envoyé tel quel au prospect Tunnel A.', 5)
ON CONFLICT (code) DO NOTHING;

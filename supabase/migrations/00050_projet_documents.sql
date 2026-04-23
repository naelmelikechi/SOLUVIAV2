-- Projet documents: pièces jointes administratives liées à un projet
CREATE TABLE projet_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id     UUID NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  nom_fichier   TEXT NOT NULL,
  type_document TEXT,
  storage_path  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projet_docs_projet ON projet_documents(projet_id);

ALTER TABLE projet_documents ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY admin_all_projet_documents ON projet_documents
  FOR ALL USING (is_admin());

-- CDP: read documents of own projects
CREATE POLICY cdp_read_projet_documents ON projet_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = projet_documents.projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

-- CDP: insert on own projects
CREATE POLICY cdp_insert_projet_documents ON projet_documents FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projets p WHERE p.id = projet_id
        AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
    )
  );

-- CDP: delete own uploads on own projects
CREATE POLICY cdp_delete_projet_documents ON projet_documents FOR DELETE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projets p WHERE p.id = projet_documents.projet_id
        AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
    )
  );

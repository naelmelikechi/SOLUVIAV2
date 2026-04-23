-- Storage buckets for document uploads (private, access via signed URLs only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policies on storage.objects: authenticated users can upload and read
-- (table-level RLS on client_documents / projet_documents gates the metadata,
-- and reads go through signed URLs anyway)
DROP POLICY IF EXISTS "auth_upload_client_documents" ON storage.objects;
CREATE POLICY "auth_upload_client_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-documents');

DROP POLICY IF EXISTS "auth_read_client_documents" ON storage.objects;
CREATE POLICY "auth_read_client_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'client-documents');

DROP POLICY IF EXISTS "auth_delete_client_documents" ON storage.objects;
CREATE POLICY "auth_delete_client_documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'client-documents');

DROP POLICY IF EXISTS "auth_upload_project_documents" ON storage.objects;
CREATE POLICY "auth_upload_project_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-documents');

DROP POLICY IF EXISTS "auth_read_project_documents" ON storage.objects;
CREATE POLICY "auth_read_project_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents');

DROP POLICY IF EXISTS "auth_delete_project_documents" ON storage.objects;
CREATE POLICY "auth_delete_project_documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-documents');

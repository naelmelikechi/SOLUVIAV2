-- Scope storage.objects policies to the rows the caller is authorised to see.
--
-- Previous policies gated access with `bucket_id = 'xxx'` only, so any
-- authenticated user could list/download/delete any object in the bucket
-- if they knew (or could enumerate) the path. Metadata-level RLS on
-- client_documents / projet_documents gated the table rows but did not
-- protect the underlying storage object.
--
-- Upload paths are built as `{ownerId}/{timestamp}-{filename}` (see
-- lib/actions/documents.ts::buildStoragePath), so we can key the policy
-- on the `name` column of storage.objects and join against the metadata
-- table to enforce the same access rules as the table policies.

-- Helper: admin OR CDP owning the client (read)
-- Clients are globally readable by CDPs today, so any CDP can see any
-- client document. That is consistent with the current client RLS.
DROP POLICY IF EXISTS auth_upload_client_documents ON storage.objects;
DROP POLICY IF EXISTS auth_read_client_documents ON storage.objects;
DROP POLICY IF EXISTS auth_delete_client_documents ON storage.objects;

CREATE POLICY client_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND owner = auth.uid()
  );

CREATE POLICY client_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM client_documents cd
        WHERE cd.storage_path = storage.objects.name
      )
    )
  );

-- Delete: admin anywhere, uploader on own document only. Table-level
-- policy on client_documents already restricts metadata deletion to
-- admin; this keeps storage consistent with it.
CREATE POLICY client_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      is_admin()
      OR owner = auth.uid()
    )
  );

-- Projet documents: scoped to projects the CDP owns (cdp_id or backup).
DROP POLICY IF EXISTS auth_upload_project_documents ON storage.objects;
DROP POLICY IF EXISTS auth_read_project_documents ON storage.objects;
DROP POLICY IF EXISTS auth_delete_project_documents ON storage.objects;

CREATE POLICY projet_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND owner = auth.uid()
  );

CREATE POLICY projet_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1
        FROM projet_documents pd
        JOIN projets p ON p.id = pd.projet_id
        WHERE pd.storage_path = storage.objects.name
          AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
      )
    )
  );

CREATE POLICY projet_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (
      is_admin()
      OR (
        owner = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM projet_documents pd
          JOIN projets p ON p.id = pd.projet_id
          WHERE pd.storage_path = storage.objects.name
            AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
        )
      )
    )
  );

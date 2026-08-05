-- REPARATION : les policies storage.objects des buckets `client-documents` et
-- `project-documents` sont absentes de la prod self-hosted.
--
-- Constat (lecture directe prod, 2026-08-05) : `storage.objects` a RLS active,
-- mais pg_policies ne contient QUE les policies des buckets crees apres la
-- bascule self-hosted (`passation-documents`, `signature-documents`,
-- `commercial-templates`). Celles de `00051_documents_storage.sql` et
-- `20260424113204_scope_storage_policies.sql` sont enregistrees comme
-- appliquees dans supabase_migrations.schema_migrations mais n'ont jamais
-- tourne sur cette instance (baseline du 2026-05-28). Consequence : RLS sans
-- policy = tout INSERT authentifie refuse, donc AUCUN document deposable.
-- Preuve chiffree : 0 objet dans ces deux buckets depuis toujours, contre 4
-- dans `passation-documents`.
--
-- Cette migration rejoue les policies (idempotente : DROP IF EXISTS + CREATE),
-- avec une correction : la lecture et la suppression de `project-documents`
-- couvrent desormais AUSSI `projet_lancement_documents`. La version d'origine
-- ne joignait que `projet_documents`, donc un CDP non-admin n'aurait pu ni
-- relire ni supprimer les pieces de la timeline de lancement qu'il vient de
-- deposer (table creee bien apres la policy, cf 20260723150000).

-- ---------------------------------------------------------------------------
-- Buckets (no-op si deja presents)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false),
       ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- client-documents
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS auth_upload_client_documents ON storage.objects;
DROP POLICY IF EXISTS auth_read_client_documents ON storage.objects;
DROP POLICY IF EXISTS auth_delete_client_documents ON storage.objects;
DROP POLICY IF EXISTS client_documents_insert ON storage.objects;
DROP POLICY IF EXISTS client_documents_read ON storage.objects;
DROP POLICY IF EXISTS client_documents_delete ON storage.objects;

-- INSERT volontairement independant de `owner` : cette colonne est renseignee
-- par l'API storage a partir du JWT, et faire dependre le WITH CHECK de sa
-- valeur au moment de l'insertion nous rendrait tributaires du comportement
-- exact de la version de storage deployee. C'est ce qu'on cherche justement a
-- ne plus subir. Portee inchangee : la version d'origine (`owner = auth.uid()`)
-- revenait deja a autoriser tout utilisateur authentifie a deposer.
CREATE POLICY client_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-documents');

-- Les clients sont globalement lisibles par les CDP aujourd'hui : la lecture
-- d'un document client suit la meme regle que la table client_documents.
CREATE POLICY client_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      (SELECT is_admin())
      OR EXISTS (
        SELECT 1 FROM client_documents cd
        WHERE cd.storage_path = storage.objects.name
      )
    )
  );

CREATE POLICY client_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      (SELECT is_admin())
      OR owner = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- project-documents (documents projet + documents de la timeline lancement)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS auth_upload_project_documents ON storage.objects;
DROP POLICY IF EXISTS auth_read_project_documents ON storage.objects;
DROP POLICY IF EXISTS auth_delete_project_documents ON storage.objects;
DROP POLICY IF EXISTS projet_documents_insert ON storage.objects;
DROP POLICY IF EXISTS projet_documents_read ON storage.objects;
DROP POLICY IF EXISTS projet_documents_delete ON storage.objects;

-- Meme logique que ci-dessus pour `owner`, mais on peut faire mieux ici : les
-- deux chemins d'upload du bucket commencent par l'UUID du projet
-- (`{projetId}/{ts}-{nom}` cote documents projet, `{projetId}/lancement/...`
-- cote timeline). On autorise donc le depot sur le projet lui-meme, ce qui est
-- plus strict que la version d'origine.
CREATE POLICY projet_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND (
      (SELECT is_admin())
      OR EXISTS (
        SELECT 1 FROM projets p
        WHERE p.id::text = split_part(storage.objects.name, '/', 1)
          AND (p.cdp_id = (SELECT auth.uid())
               OR p.backup_cdp_id = (SELECT auth.uid()))
      )
    )
  );

CREATE POLICY projet_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (
      (SELECT is_admin())
      OR EXISTS (
        SELECT 1
        FROM projet_documents pd
        JOIN projets p ON p.id = pd.projet_id
        WHERE pd.storage_path = storage.objects.name
          AND (p.cdp_id = (SELECT auth.uid())
               OR p.backup_cdp_id = (SELECT auth.uid()))
      )
      OR EXISTS (
        SELECT 1
        FROM projet_lancement_documents ld
        JOIN projets p ON p.id = ld.projet_id
        WHERE ld.storage_path = storage.objects.name
          AND (p.cdp_id = (SELECT auth.uid())
               OR p.backup_cdp_id = (SELECT auth.uid()))
      )
    )
  );

CREATE POLICY projet_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (
      (SELECT is_admin())
      OR (
        owner = (SELECT auth.uid())
        AND (
          EXISTS (
            SELECT 1
            FROM projet_documents pd
            JOIN projets p ON p.id = pd.projet_id
            WHERE pd.storage_path = storage.objects.name
              AND (p.cdp_id = (SELECT auth.uid())
                   OR p.backup_cdp_id = (SELECT auth.uid()))
          )
          OR EXISTS (
            SELECT 1
            FROM projet_lancement_documents ld
            JOIN projets p ON p.id = ld.projet_id
            WHERE ld.storage_path = storage.objects.name
              AND (p.cdp_id = (SELECT auth.uid())
                   OR p.backup_cdp_id = (SELECT auth.uid()))
          )
        )
      )
    )
  );

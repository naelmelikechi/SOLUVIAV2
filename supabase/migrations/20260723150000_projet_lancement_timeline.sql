-- Timeline de lancement par projet : 7 etapes fixes (contrat signe, NDA,
-- extension NDA, Qualiopi, UAI, agrements, production). Chaque etape a un
-- statut (non_commence / en_cours / lance), des documents (stockes dans le
-- bucket project-documents existant) et des commentaires.
-- Les rows de statut sont creees a la demande : absence = non_commence.
--
-- RLS en style consolide (cf 20260511225656 lot3 + 20260615130000) : une seule
-- policy permissive par commande, is_admin() OR condition cdp, initplan-wrap
-- (SELECT auth.uid()) partout et (SELECT is_admin()) sur les SELECT.

-- ---------------------------------------------------------------------------
-- Statuts des etapes
-- ---------------------------------------------------------------------------
CREATE TABLE projet_lancement_etapes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id   UUID NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  etape_key   TEXT NOT NULL CHECK (etape_key IN
    ('contrat_signe', 'nda', 'extension_nda', 'qualiopi', 'uai', 'agrements', 'production')),
  statut      TEXT NOT NULL DEFAULT 'non_commence' CHECK (statut IN
    ('non_commence', 'en_cours', 'lance')),
  updated_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (projet_id, etape_key)
);

-- UNIQUE (projet_id, etape_key) couvre deja les lookups par projet_id
CREATE INDEX idx_lancement_etapes_updated_by ON projet_lancement_etapes(updated_by);

CREATE TRIGGER trg_lancement_etapes_updated_at
  BEFORE UPDATE ON projet_lancement_etapes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE projet_lancement_etapes ENABLE ROW LEVEL SECURITY;

CREATE POLICY lancement_etapes_select ON projet_lancement_etapes FOR SELECT USING (
  (SELECT is_admin()) OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = projet_lancement_etapes.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);

CREATE POLICY lancement_etapes_insert ON projet_lancement_etapes FOR INSERT WITH CHECK (
  is_admin() OR (
    updated_by = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM projets p WHERE p.id = projet_lancement_etapes.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  )
);

CREATE POLICY lancement_etapes_update ON projet_lancement_etapes FOR UPDATE
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM projets p WHERE p.id = projet_lancement_etapes.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    is_admin() OR (
      updated_by = (SELECT auth.uid()) AND EXISTS (
        SELECT 1 FROM projets p WHERE p.id = projet_lancement_etapes.projet_id
          AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
      )
    )
  );

CREATE POLICY lancement_etapes_delete ON projet_lancement_etapes FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- Documents par etape (fichiers dans le bucket project-documents)
-- ---------------------------------------------------------------------------
CREATE TABLE projet_lancement_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id     UUID NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  etape_key     TEXT NOT NULL CHECK (etape_key IN
    ('contrat_signe', 'nda', 'extension_nda', 'qualiopi', 'uai', 'agrements', 'production')),
  user_id       UUID NOT NULL REFERENCES users(id),
  nom_fichier   TEXT NOT NULL,
  type_document TEXT,
  storage_path  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lancement_docs_projet ON projet_lancement_documents(projet_id);
CREATE INDEX idx_lancement_docs_user ON projet_lancement_documents(user_id);

ALTER TABLE projet_lancement_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY lancement_documents_select ON projet_lancement_documents FOR SELECT USING (
  (SELECT is_admin()) OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = projet_lancement_documents.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);

CREATE POLICY lancement_documents_insert ON projet_lancement_documents FOR INSERT WITH CHECK (
  is_admin() OR (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM projets p WHERE p.id = projet_lancement_documents.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  )
);

CREATE POLICY lancement_documents_update ON projet_lancement_documents FOR UPDATE
  USING (is_admin());

CREATE POLICY lancement_documents_delete ON projet_lancement_documents FOR DELETE USING (
  is_admin() OR (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM projets p WHERE p.id = projet_lancement_documents.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  )
);

-- ---------------------------------------------------------------------------
-- Commentaires par etape
-- ---------------------------------------------------------------------------
CREATE TABLE projet_lancement_commentaires (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id   UUID NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  etape_key   TEXT NOT NULL CHECK (etape_key IN
    ('contrat_signe', 'nda', 'extension_nda', 'qualiopi', 'uai', 'agrements', 'production')),
  user_id     UUID NOT NULL REFERENCES users(id),
  contenu     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lancement_comments_projet ON projet_lancement_commentaires(projet_id);
CREATE INDEX idx_lancement_comments_user ON projet_lancement_commentaires(user_id);

ALTER TABLE projet_lancement_commentaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY lancement_commentaires_select ON projet_lancement_commentaires FOR SELECT USING (
  (SELECT is_admin()) OR EXISTS (
    SELECT 1 FROM projets p WHERE p.id = projet_lancement_commentaires.projet_id
      AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
  )
);

CREATE POLICY lancement_commentaires_insert ON projet_lancement_commentaires FOR INSERT WITH CHECK (
  is_admin() OR (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM projets p WHERE p.id = projet_lancement_commentaires.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  )
);

CREATE POLICY lancement_commentaires_update ON projet_lancement_commentaires FOR UPDATE
  USING (is_admin());

CREATE POLICY lancement_commentaires_delete ON projet_lancement_commentaires FOR DELETE USING (
  is_admin() OR (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM projets p WHERE p.id = projet_lancement_commentaires.projet_id
        AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  )
);

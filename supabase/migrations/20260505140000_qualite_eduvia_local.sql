-- Tables SOLUVIA-side pour completer le module qualite Eduvia.
-- L'API V1 Eduvia ne supporte pas (encore) :
-- - les motifs de rejet sur les preuves
-- - l'assignation des responsables d'indicateurs aux users SOLUVIA
-- On stocke ces deux infos cote SOLUVIA pour ne pas attendre les evolutions
-- backend Eduvia. Reference : discussion 2026-05-05 question 2 et 4.

-- ---------------------------------------------------------------------------
-- qualite_assignments : responsable SOLUVIA d'un indicateur Eduvia par campus
-- ---------------------------------------------------------------------------
-- Cle de scoping : (campus_id, indicator_id) - un seul responsable par couple.
-- client_id sert a filtrer rapidement les assignations d'un CFA SOLUVIA.

CREATE TABLE qualite_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Eduvia campus_id (entier cote Eduvia)
  campus_id       INTEGER NOT NULL,
  -- Eduvia indicator_id (entier cote Eduvia, du referentiel partage)
  indicator_id    INTEGER NOT NULL,
  -- Le user SOLUVIA designe responsable. NULL = pas de responsable.
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_qualite_assignment UNIQUE (campus_id, indicator_id)
);

CREATE INDEX idx_qualite_assignments_client ON qualite_assignments (client_id);
CREATE INDEX idx_qualite_assignments_user ON qualite_assignments (user_id);

CREATE TRIGGER trg_qualite_assignments_updated
  BEFORE UPDATE ON qualite_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- qualite_evidence_notes : motif de rejet ou note libre sur une preuve Eduvia
-- ---------------------------------------------------------------------------
-- Une preuve Eduvia est identifiee par son evidence_id (entier Eduvia).
-- On peut avoir plusieurs notes par preuve (historique d'echanges).
-- Le champ "kind" distingue motif de rejet vs note generique.

CREATE TABLE qualite_evidence_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campus_id       INTEGER NOT NULL,
  evidence_id     INTEGER NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('rejection', 'note')),
  message         TEXT NOT NULL,
  author_id       UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qualite_evidence_notes_evidence
  ON qualite_evidence_notes (evidence_id);
CREATE INDEX idx_qualite_evidence_notes_client
  ON qualite_evidence_notes (client_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE qualite_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualite_evidence_notes ENABLE ROW LEVEL SECURITY;

-- Admin/Superadmin : tous les droits via is_admin()
CREATE POLICY admin_all_qualite_assignments ON qualite_assignments
  FOR ALL USING (is_admin());
CREATE POLICY admin_all_qualite_evidence_notes ON qualite_evidence_notes
  FOR ALL USING (is_admin());

-- CDP : lecture sur les clients de leurs projets (les CDP voient les
-- assignations de leur perimetre pour savoir qui est responsable)
CREATE POLICY cdp_select_qualite_assignments ON qualite_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projets p
      WHERE p.client_id = qualite_assignments.client_id
        AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
        AND p.archive = false
    )
  );

CREATE POLICY cdp_select_qualite_evidence_notes ON qualite_evidence_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projets p
      WHERE p.client_id = qualite_evidence_notes.client_id
        AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
        AND p.archive = false
    )
  );

-- CDP : creation de notes (pas d'assignations - reserve admin pour eviter qu'un
-- CDP s'auto-assigne)
CREATE POLICY cdp_insert_qualite_evidence_notes ON qualite_evidence_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projets p
      WHERE p.client_id = qualite_evidence_notes.client_id
        AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
        AND p.archive = false
    )
  );

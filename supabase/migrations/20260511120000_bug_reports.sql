-- Bug reports: users (admin + cdp) signalent un bug depuis l'app.
-- Stocke commentaire + screenshot path + contexte technique + analyse IA.

CREATE SEQUENCE IF NOT EXISTS seq_bug_report_ref START 1;

CREATE TABLE public.bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL,

  comment TEXT NOT NULL CHECK (char_length(comment) >= 20),
  perceived_severity TEXT CHECK (perceived_severity IN ('genant','bloquant','critique')),
  screenshot_path TEXT,

  page_url TEXT NOT NULL,
  user_agent TEXT,
  viewport JSONB,
  console_errors JSONB,
  sentry_event_id TEXT,
  extra_context JSONB,

  ai_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ai_status IN ('pending','done','failed','skipped')),
  ai_severity TEXT CHECK (ai_severity IN ('low','medium','high','critical')),
  ai_category TEXT,
  ai_summary TEXT,
  ai_hypotheses JSONB,
  ai_error TEXT,
  ai_processed_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'nouveau'
    CHECK (status IN ('nouveau','en_cours','resolu','wontfix')),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archive BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX bug_reports_status_idx ON bug_reports(status) WHERE archive = false;
CREATE INDEX bug_reports_created_at_idx ON bug_reports(created_at DESC);
CREATE INDEX bug_reports_user_id_idx ON bug_reports(user_id);

-- Trigger ref: BUG-NNNN (gapless via sequence, soft delete only)
CREATE OR REPLACE FUNCTION generate_bug_report_ref()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ref := 'BUG-' || lpad(nextval('seq_bug_report_ref')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

CREATE TRIGGER bug_reports_generate_ref
BEFORE INSERT ON bug_reports
FOR EACH ROW
WHEN (NEW.ref IS NULL)
EXECUTE FUNCTION generate_bug_report_ref();

-- updated_at auto
CREATE TRIGGER bug_reports_updated_at
BEFORE UPDATE ON bug_reports
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- INSERT: tout utilisateur authentifie peut creer un report pour lui-meme.
-- (user_id = auth.uid() force par le check)
CREATE POLICY bug_reports_insert_own
ON bug_reports FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- SELECT: admin uniquement (les CDP ne consultent pas les reports d'autrui
-- ni les leurs - tout passe par le dashboard admin)
CREATE POLICY bug_reports_select_admin
ON bug_reports FOR SELECT
TO authenticated
USING (get_user_role() = 'admin');

-- UPDATE: admin uniquement (changement de statut, resolution_notes)
CREATE POLICY bug_reports_update_admin
ON bug_reports FOR UPDATE
TO authenticated
USING (get_user_role() = 'admin')
WITH CHECK (get_user_role() = 'admin');

-- Pas de DELETE policy : soft delete via archive = true

-- Storage bucket: screenshots prives, lecture/ecriture via service role uniquement
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-screenshots',
  'bug-screenshots',
  false,
  5242880,  -- 5 MB
  ARRAY['image/png','image/jpeg','image/jpg','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Pas de policies storage : tout passe par service role cote serveur (route handler)
-- Les URLs signees sont generees a la demande (1h pour analyse IA, 7 jours pour email admin).

COMMENT ON TABLE bug_reports IS
'User-submitted bug reports avec analyse IA (triage + synthese). Cree depuis le bouton bug du dashboard.';

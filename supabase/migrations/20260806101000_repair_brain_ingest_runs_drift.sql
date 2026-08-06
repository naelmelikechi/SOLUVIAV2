-- Reparation drift local/prod : public.brain_ingest_runs existe en PROD (creee
-- directement pendant le chantier "cerveau", cf `npm run brain:ingest`) mais
-- aucune migration du repo ne la creait. L'anti-drift
-- (scripts/check-schema-drift.ts) echoue donc en CI, y compris sur main depuis
-- le commit 01b46688, et un `gen types --local` supprimerait silencieusement
-- ses 6 colonnes de types/database.ts.
--
-- Meme cas de figure et meme traitement que
-- 20260805180000_repair_brain_proposals_drift.sql (PR #117).
--
-- Cette migration REPRODUIT a l'identique l'etat constate en prod le
-- 2026-08-06 (colonnes, contraintes, index, RLS, policy), releve via pg-meta.
-- Entierement idempotente : no-op en prod, creation en local / CI. Elle ne
-- prejuge pas des evolutions a venir du chantier cerveau.

CREATE TABLE IF NOT EXISTS public.brain_ingest_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  statut      TEXT NOT NULL DEFAULT 'running'
    CHECK (statut IN ('running', 'success', 'error')),
  erreur      TEXT,
  stats       JSONB
);

COMMENT ON TABLE public.brain_ingest_runs IS
  'Journal des executions de l''ingestion du cerveau (scripts/brain-ingest.ts). Lisible par les admins uniquement.';

CREATE INDEX IF NOT EXISTS brain_ingest_runs_started_idx
  ON public.brain_ingest_runs USING btree (started_at DESC);

ALTER TABLE public.brain_ingest_runs ENABLE ROW LEVEL SECURITY;

-- Lecture reservee aux admins. L'ecriture passe par le script d'ingestion en
-- service_role, qui contourne RLS : aucune policy d'ecriture n'est necessaire.
DROP POLICY IF EXISTS "runs d'ingestion lisibles par admin" ON public.brain_ingest_runs;
CREATE POLICY "runs d'ingestion lisibles par admin"
  ON public.brain_ingest_runs
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

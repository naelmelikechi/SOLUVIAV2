-- Reparation drift local/prod : public.brain_proposals existe en PROD (creee
-- directement pendant le chantier "cerveau semi-automatique") mais aucune
-- migration du repo ne la creait. L'anti-drift (scripts/check-schema-drift.ts)
-- echoue donc en CI sur main, et un `gen types --local` supprimerait
-- silencieusement ses 11 colonnes de types/database.ts.
--
-- Cette migration REPRODUIT a l'identique l'etat constate en prod le
-- 2026-08-05 (colonnes, contraintes, index, RLS). Entierement idempotente :
-- no-op en prod, creation en local / CI. Elle ne prejuge pas des evolutions
-- a venir du chantier cerveau - toute suite se fera par une migration
-- ulterieure.

CREATE TABLE IF NOT EXISTS public.brain_proposals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL
    CHECK (kind IN ('conversation', 'entite', 'lacune', 'obsolescence')),
  status       TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (status IN ('en_attente', 'approuvee', 'rejetee', 'a_regenerer')),
  target_path  TEXT,
  payload      JSONB NOT NULL,
  -- (kind, source_ref) UNIQUE : idempotence de la proposition - une meme
  -- source ne peut pas generer deux fois la meme proposition.
  source_ref   TEXT NOT NULL,
  source_hash  TEXT NOT NULL,
  reason       TEXT,
  decided_by   UUID REFERENCES public.users(id),
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, source_ref)
);

CREATE INDEX IF NOT EXISTS brain_proposals_status_kind_idx
  ON public.brain_proposals (status, kind);

ALTER TABLE public.brain_proposals ENABLE ROW LEVEL SECURITY;

-- Lecture et arbitrage reserves aux admins (is_admin() couvre admin +
-- superadmin). Pas de policy INSERT : les propositions sont ecrites par les
-- jobs serveur via la service role, qui contourne RLS.
DROP POLICY IF EXISTS "propositions lisibles par admin" ON public.brain_proposals;
CREATE POLICY "propositions lisibles par admin"
  ON public.brain_proposals FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "propositions arbitrees par admin" ON public.brain_proposals;
CREATE POLICY "propositions arbitrees par admin"
  ON public.brain_proposals FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

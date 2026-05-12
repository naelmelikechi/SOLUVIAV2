-- Migration : table eduvia_invoice_lines pour stocker le detail des lignes
-- des bordereaux OPCO emis (endpoint /api/v1/invoices/:id/lines).
-- Cle primaire = id UUID, cle naturelle = (eduvia_id, source_client_id).
-- Multi-tenant : source_client_id permet d'isoler chaque CFA. RLS aligne
-- sur le pattern existant des autres tables eduvia_*.

CREATE TABLE IF NOT EXISTS public.eduvia_invoice_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eduvia_id           BIGINT NOT NULL,
  source_client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contrat_id          UUID NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  eduvia_invoice_id   BIGINT NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  line_type           TEXT NOT NULL,
  quantity            INTEGER NOT NULL DEFAULT 1,
  description         TEXT,
  eduvia_created_at   TIMESTAMPTZ,
  eduvia_updated_at   TIMESTAMPTZ,
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_eduvia_invoice_lines_eduvia_id_per_client
    UNIQUE (eduvia_id, source_client_id)
);

CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_lines_contrat
  ON public.eduvia_invoice_lines (contrat_id);
CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_lines_invoice
  ON public.eduvia_invoice_lines (eduvia_invoice_id);
CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_lines_type
  ON public.eduvia_invoice_lines (line_type);

ALTER TABLE public.eduvia_invoice_lines ENABLE ROW LEVEL SECURITY;

-- Lecture : admin/superadmin partout, CDP scope par projet via contrat → projet → cdp_id.
CREATE POLICY eduvia_invoice_lines_select
  ON public.eduvia_invoice_lines
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
        FROM public.contrats c
        JOIN public.projets p ON p.id = c.projet_id
       WHERE c.id = eduvia_invoice_lines.contrat_id
         AND (p.cdp_id = (SELECT auth.uid()) OR p.backup_cdp_id = (SELECT auth.uid()))
    )
  );

-- Ecriture : admin uniquement (service role bypasse RLS pour la sync Eduvia).
CREATE POLICY eduvia_invoice_lines_insert
  ON public.eduvia_invoice_lines
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY eduvia_invoice_lines_update
  ON public.eduvia_invoice_lines
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY eduvia_invoice_lines_delete
  ON public.eduvia_invoice_lines
  FOR DELETE
  USING (public.is_admin());

COMMENT ON TABLE public.eduvia_invoice_lines IS
  'Detail ligne par ligne des bordereaux OPCO emis. Source : endpoint Eduvia non documente /api/v1/invoices/:id/lines. Cle de calcul de commission Soluvia (whitelist line_type=PEDAGOGIE).';

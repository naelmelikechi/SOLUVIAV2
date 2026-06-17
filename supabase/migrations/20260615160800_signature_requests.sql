-- Feature 5 — Signature de contrat.
-- V1 : suivi de signature avec mode MANUEL (le contrat signé est uploadé comme
-- preuve). Un connecteur e-signature (Yousign / Oodrive / …) se branche derrière
-- l'abstraction lib/signature/provider.ts sans changer ce modèle : il suffira
-- de renseigner provider/provider_request_id et de laisser le webhook faire
-- évoluer le statut. Le choix du prestataire + sa clé API restent à acter.

CREATE TYPE statut_signature AS ENUM (
  'brouillon',
  'envoyee',
  'signee',
  'refusee',
  'expiree',
  'annulee'
);

CREATE TABLE signature_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id          UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  titre                TEXT NOT NULL,
  provider             TEXT NOT NULL DEFAULT 'manuel',
  provider_request_id  TEXT,
  statut               statut_signature NOT NULL DEFAULT 'brouillon',
  document_path        TEXT,
  signed_document_path TEXT,
  initiated_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at              TIMESTAMPTZ,
  signed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_signature_requests_prospect
  ON signature_requests(prospect_id);

CREATE TRIGGER trg_signature_requests_updated
  BEFORE UPDATE ON signature_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Toute activité de signature rafraîchit la fraîcheur du prospect.
CREATE TRIGGER trg_signature_requests_bump
  AFTER INSERT OR UPDATE ON signature_requests
  FOR EACH ROW EXECUTE FUNCTION bump_prospect_derniere_action();

ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY signature_requests_select ON signature_requests
  FOR SELECT TO public USING (((SELECT is_admin()) OR has_pipeline_access()));
CREATE POLICY signature_requests_insert ON signature_requests
  FOR INSERT TO public WITH CHECK ((is_admin() OR has_pipeline_access()));
CREATE POLICY signature_requests_update ON signature_requests
  FOR UPDATE TO public USING ((is_admin() OR has_pipeline_access()));
CREATE POLICY signature_requests_delete ON signature_requests
  FOR DELETE TO public USING (is_admin());

-- Bucket privé des documents de signature (à signer + preuve signée).
INSERT INTO storage.buckets (id, name, public)
VALUES ('signature-documents', 'signature-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pipeline_write_signature_documents" ON storage.objects;
CREATE POLICY "pipeline_write_signature_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'signature-documents' AND (is_admin() OR has_pipeline_access())
  );

DROP POLICY IF EXISTS "pipeline_read_signature_documents" ON storage.objects;
CREATE POLICY "pipeline_read_signature_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signature-documents' AND (is_admin() OR has_pipeline_access())
  );

DROP POLICY IF EXISTS "admin_delete_signature_documents" ON storage.objects;
CREATE POLICY "admin_delete_signature_documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'signature-documents' AND is_admin());

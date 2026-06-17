-- Feature 7 — Référent CDP : plan de charge, affectation CDP↔client, pipeline CDP.
-- Choix d'implémentation validés (defaults) :
--   - Rôle "Référent CDP" : flag users.referent_cdp (calqué sur pipeline_access).
--   - Disponibilité déclarée (V1 champ libre) : users.cdp_disponibilite.
--   - Affectation CDP↔client : clients.cdp_referent_id + cdp_affecte_at
--     (niveau client ; projets.cdp_id reste l'affectation par projet).
--   - Saturation : 5 clients OU 300 alternants (constante app cdp-scoring.ts).
-- Hors V1 (données absentes du schéma) : satisfaction Mission K, secteurs.

CREATE TYPE dispo_cdp AS ENUM ('disponible', 'tendu', 'sature');

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referent_cdp      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cdp_disponibilite dispo_cdp;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS cdp_referent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cdp_affecte_at  TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_clients_cdp_referent ON clients(cdp_referent_id);

CREATE TABLE cdp_affectation_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  from_cdp_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  to_cdp_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  justification TEXT,
  changed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cdp_affectation_history_client ON cdp_affectation_history(client_id);

CREATE OR REPLACE FUNCTION is_referent_cdp()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT referent_cdp OR role IN ('admin', 'superadmin')
       FROM users WHERE id = auth.uid()),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION is_referent_cdp() TO authenticated;

ALTER TABLE cdp_affectation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY cdp_affectation_history_select ON cdp_affectation_history
  FOR SELECT TO public USING (((SELECT is_admin()) OR has_pipeline_access()));
CREATE POLICY cdp_affectation_history_insert ON cdp_affectation_history
  FOR INSERT TO public WITH CHECK (is_referent_cdp());
CREATE POLICY cdp_affectation_history_delete ON cdp_affectation_history
  FOR DELETE TO public USING (is_admin());

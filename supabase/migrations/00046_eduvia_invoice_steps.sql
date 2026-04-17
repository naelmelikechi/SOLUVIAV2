-- 00046_eduvia_invoice_steps.sql
-- Invoice steps pulled from Eduvia per contract. Two tables because the
-- forecast schema is a strict subset of the actual-steps schema and we
-- want distinct constraints per shape.

CREATE TABLE IF NOT EXISTS eduvia_invoice_steps (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eduvia_id                   INTEGER UNIQUE NOT NULL,
  contrat_id                  UUID NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
  eduvia_contract_id          INTEGER NOT NULL,
  eduvia_invoice_id           INTEGER,
  step_number                 INTEGER NOT NULL,
  opening_date                DATE,
  total_amount                NUMERIC(12,2),
  including_pedagogie_amount  NUMERIC(12,2),
  including_rqth_amount       NUMERIC(12,2),
  paid_amount                 NUMERIC(12,2),
  in_progress_amount          NUMERIC(12,2),
  siret_cfa                   TEXT,
  external_code               TEXT,
  invoice_state               TEXT,
  invoice_sent_at             TIMESTAMPTZ,
  last_synced_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_steps_contrat_id
  ON eduvia_invoice_steps(contrat_id);
CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_steps_invoice_state
  ON eduvia_invoice_steps(invoice_state);

CREATE TABLE IF NOT EXISTS eduvia_invoice_forecast_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eduvia_id           INTEGER UNIQUE NOT NULL,
  contrat_id          UUID NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
  eduvia_contract_id  INTEGER NOT NULL,
  step_number         INTEGER NOT NULL,
  opening_date        DATE,
  total_amount        NUMERIC(12,2),
  percentage          NUMERIC(5,2),
  npec_amount         NUMERIC(12,2),
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_forecast_steps_contrat_id
  ON eduvia_invoice_forecast_steps(contrat_id);

ALTER TABLE eduvia_invoice_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE eduvia_invoice_forecast_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY eduvia_invoice_steps_select ON eduvia_invoice_steps
  FOR SELECT USING (contrat_id IN (SELECT id FROM contrats));
CREATE POLICY eduvia_invoice_steps_admin_all ON eduvia_invoice_steps
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role::text IN ('admin', 'superadmin'))
  );

CREATE POLICY eduvia_invoice_forecast_steps_select ON eduvia_invoice_forecast_steps
  FOR SELECT USING (contrat_id IN (SELECT id FROM contrats));
CREATE POLICY eduvia_invoice_forecast_steps_admin_all ON eduvia_invoice_forecast_steps
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role::text IN ('admin', 'superadmin'))
  );

COMMENT ON TABLE eduvia_invoice_steps IS 'Actual invoice steps from Eduvia /contracts/{id}/invoice_steps. Upserted on sync (natural key eduvia_id).';
COMMENT ON TABLE eduvia_invoice_forecast_steps IS 'Planned invoice steps from Eduvia /contracts/{id}/invoice_forecast_steps. Used to anticipate upcoming billing.';

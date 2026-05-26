-- Synergie #2 : table miroir des bank_lines de FINANCES-WISEMANH.
-- Permet à SOLUVIA de suggérer la bonne bank.statement.line lors du
-- bouton "marquer payée" (matching montant + ref FAC-XXX) sans interroger
-- en cross-DB.
--
-- Alimentation : POST /api/webhooks/finances/bank-lines-sync depuis un cron
-- FINANCES (best-effort, dédoublonnage par source_external_id).
--
-- Pas de FK vers societes/clients/factures : c'est un miroir pur, l'usage
-- côté UI fait du matching textuel.

CREATE TABLE IF NOT EXISTS bank_lines_mirror (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotence : (source_app, source_external_id) unique
  source_app       TEXT NOT NULL DEFAULT 'finances-wisemanh',
  source_external_id INTEGER NOT NULL,                  -- account.bank.statement.line.id Odoo

  -- Métier
  date          DATE NOT NULL,
  montant       NUMERIC(15,2) NOT NULL,                 -- positif (recette)
  payment_ref   TEXT,                                   -- libellé / mémo
  partner_name  TEXT,
  societe_slug  TEXT,                                   -- 'soluvia', 'eduvia', etc.

  raw           JSONB,

  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (source_app, source_external_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_lines_mirror_date ON bank_lines_mirror(date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_lines_mirror_montant ON bank_lines_mirror(montant);
CREATE INDEX IF NOT EXISTS idx_bank_lines_mirror_payment_ref ON bank_lines_mirror USING gin (payment_ref gin_trgm_ops);

-- RLS : lecture pour les admins/superadmins (matching depuis UI), pas
-- d'écriture user (alimentation via service_role uniquement).
ALTER TABLE bank_lines_mirror ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_lines_mirror_admin_read" ON bank_lines_mirror;
CREATE POLICY "bank_lines_mirror_admin_read" ON bank_lines_mirror
  FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','superadmin'));

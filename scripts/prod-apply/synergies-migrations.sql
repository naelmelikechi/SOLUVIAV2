-- Migration : ajoute projets.code_analytique pour synergie #1 (push analytique
-- automatique vers Odoo à chaque facture postée).
--
-- Le code analytique est l'identifiant du compte analytique Odoo (champ
-- `code` de `account.analytic.account`). FINANCES-WISEMANH aligne sur la
-- même nomenclature N3 (ex : 41.01 = SOLUVIA, 42.01 = Eduvia).
--
-- NULL = pas de push analytique pour ce projet (comportement actuel). Le
-- remplissage est progressif : tant qu'aucun code n'est saisi, la synergie
-- est inactive (zero régression).

ALTER TABLE projets
  ADD COLUMN IF NOT EXISTS code_analytique TEXT NULL;

COMMENT ON COLUMN projets.code_analytique IS
  'Code du compte analytique Odoo (account.analytic.account.code). NULL = pas de ventilation analytique poussée vers Odoo.';

-- Index partiel pour lookups rapides côté push facture (seul un sous-ensemble
-- des projets aura ce champ rempli).
CREATE INDEX IF NOT EXISTS idx_projets_code_analytique
  ON projets(code_analytique)
  WHERE code_analytique IS NOT NULL;
-- Migration : ajoute facture_lignes.analytic_line_odoo_id pour synergie #1.
-- Tracé local de l'account.analytic.line créée côté Odoo lors du push facture.
-- Permet l'idempotence : si le sync re-tourne, on skip les lignes déjà poussées.

ALTER TABLE facture_lignes
  ADD COLUMN IF NOT EXISTS analytic_line_odoo_id TEXT NULL;

COMMENT ON COLUMN facture_lignes.analytic_line_odoo_id IS
  'ID Odoo (account.analytic.line) crée par le push analytique automatique. NULL = pas encore poussée OU projet.code_analytique manquant.';
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

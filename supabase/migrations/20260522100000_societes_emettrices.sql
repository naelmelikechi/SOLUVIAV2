-- Phase 1 : referentiel des societes emettrices (SOLUVIA, DIGIVIA, ...).
-- En Phase 1 seul SOLUVIA est seede et toutes les factures pointent dessus.
-- La numerotation facture reste globale (trigger inchange). L'adaptation
-- par societe interviendra en Phase 4 quand DIGIVIA arrivera.

CREATE TABLE societes_emettrices (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                         TEXT NOT NULL UNIQUE,
  raison_sociale               TEXT NOT NULL,
  forme_juridique              TEXT,
  siret                        TEXT NOT NULL,
  tva_intracom                 TEXT NOT NULL,
  capital_social               NUMERIC(12, 2),
  adresse                      TEXT NOT NULL,
  code_postal                  TEXT NOT NULL,
  ville                        TEXT NOT NULL,
  pays                         TEXT NOT NULL DEFAULT 'France',
  email_contact                TEXT NOT NULL,
  telephone                    TEXT,
  logo_url                     TEXT,
  banque_nom                   TEXT,
  banque_iban                  TEXT,
  banque_bic                   TEXT,
  mentions_legales             TEXT,
  conditions_reglement_default TEXT,
  validite_devis_jours         INTEGER NOT NULL DEFAULT 90 CHECK (validite_devis_jours > 0),
  odoo_company_id              INTEGER,
  odoo_journal_id              INTEGER,
  est_defaut                   BOOLEAN NOT NULL DEFAULT FALSE,
  actif                        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_societes_emettrices_defaut
  ON societes_emettrices (est_defaut)
  WHERE est_defaut = TRUE;

CREATE TRIGGER trg_societes_emettrices_updated_at
  BEFORE UPDATE ON societes_emettrices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE societes_emettrices ENABLE ROW LEVEL SECURITY;

CREATE POLICY societes_emettrices_select_authenticated
  ON societes_emettrices FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY societes_emettrices_admin_write
  ON societes_emettrices FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role() IN ('admin', 'superadmin'));

INSERT INTO societes_emettrices (
  code, raison_sociale, forme_juridique, siret, tva_intracom, capital_social,
  adresse, code_postal, ville, pays, email_contact,
  banque_nom, banque_iban, banque_bic,
  mentions_legales, conditions_reglement_default,
  est_defaut, actif
) VALUES (
  'SOL',
  'S.A.S. SOLUVIA',
  'S.A.S.',
  '994 241 537 00012',
  'FR37994241537',
  NULL,
  '27 Rue Jacqueline Cochran',
  '79000',
  'Niort',
  'France',
  'contact@mysoluvia.com',
  'Credit Agricole Charente-Maritime Deux-Sevres',
  'FR76 1170 6337 1156 0576 1259 857',
  'AGRIFRPP817',
  'S.A.S. SOLUVIA - SIRET 994 241 537 00012 - TVA intracommunautaire FR37994241537',
  'Paiement par virement bancaire sous 30 jours. Penalites en cas de retard : 3 fois le taux d''interet legal + indemnite forfaitaire de 40 EUR pour frais de recouvrement (art. L441-10 Code de commerce).',
  TRUE,
  TRUE
);

COMMENT ON TABLE societes_emettrices IS
  'Referentiel des entites juridiques qui emettent devis et factures (SOLUVIA, DIGIVIA, ...). Une seule peut etre marquee defaut (est_defaut = TRUE).';

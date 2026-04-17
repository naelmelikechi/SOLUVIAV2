-- 00044_eduvia_api_alignment.sql
-- Aligns existing Eduvia-synced tables with the real Eduvia OpenAPI v1 schema.
-- All changes are additive: existing columns (apprenant_nom, formation_titre,
-- eduvia_companies.name, etc.) are preserved because queries throughout the
-- app rely on them; the sync code will now populate them from the real
-- renamed API fields (contract.employee_id + lookup, etc.).

-- ── contrats: add FK-by-eduvia-id columns + real Eduvia fields ─────────
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS eduvia_employee_id INTEGER;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS eduvia_formation_id INTEGER;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS eduvia_company_id INTEGER;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS eduvia_teacher_id INTEGER;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS eduvia_campus_id INTEGER;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS contract_number TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS internal_number TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS contract_mode TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS contract_conclusion_date DATE;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS practical_training_start_date DATE;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS creation_mode TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS npec_amount NUMERIC(12,2);
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS referrer_name TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS referrer_amount NUMERIC(12,2);
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS referrer_type TEXT;

CREATE INDEX IF NOT EXISTS idx_contrats_eduvia_employee_id ON contrats(eduvia_employee_id);
CREATE INDEX IF NOT EXISTS idx_contrats_eduvia_company_id  ON contrats(eduvia_company_id);
CREATE INDEX IF NOT EXISTS idx_contrats_eduvia_formation_id ON contrats(eduvia_formation_id);

-- ── eduvia_companies: legal identifiers + address ───────────────────────
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS denomination TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS naf TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS postcode TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS employee_count INTEGER;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS idcc_code TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS employer_type TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS eduvia_campus_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_eduvia_companies_siret ON eduvia_companies(siret);

-- ── formations: qualification metadata ──────────────────────────────────
ALTER TABLE formations ADD COLUMN IF NOT EXISTS qualification_title TEXT;
ALTER TABLE formations ADD COLUMN IF NOT EXISTS rncp TEXT;
ALTER TABLE formations ADD COLUMN IF NOT EXISTS code_diploma TEXT;
ALTER TABLE formations ADD COLUMN IF NOT EXISTS diploma_type TEXT;
ALTER TABLE formations ADD COLUMN IF NOT EXISTS sequence_count INTEGER;

-- ── apprenants: learner profile fields from real API ───────────────────
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS eduvia_formation_id INTEGER;
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS internal_number TEXT;
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS learning_start_date DATE;
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS learning_end_date DATE;

COMMENT ON COLUMN contrats.eduvia_employee_id IS 'Matches apprenants.eduvia_id — used by sync to denormalize apprenant_nom/prenom';
COMMENT ON COLUMN contrats.eduvia_formation_id IS 'Matches formations.eduvia_id — used by sync to denormalize formation_titre';
COMMENT ON COLUMN contrats.eduvia_company_id IS 'Matches eduvia_companies.eduvia_id — used by sync to resolve projet_id via the linked client';
COMMENT ON COLUMN eduvia_companies.denomination IS 'Legal name from Eduvia (real API field). Populated in parallel with the legacy name column for backwards compatibility';
COMMENT ON COLUMN formations.qualification_title IS 'Real title from Eduvia API (replaces our previous assumption of a top-level title field).';

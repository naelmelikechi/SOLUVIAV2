-- Pipeline commercial : stage_prospect passe à 6 étapes (tunnel 4 RDV validé).
--   Ancien  : non_contacte | r1 | r2 | signe
--   Nouveau : a_qualifier | presente | cadre | audite | signe | perdu
-- Mapping (validé Direction) : non_contacte→a_qualifier, r1→presente,
-- r2→cadre, signe→signe. `audite` et `perdu` sont nouveaux (aucune ligne mappée).
--
-- Postgres n'autorise ni le retrait ni le renommage de valeurs d'enum : on crée
-- un nouvel enum, on bascule les colonnes avec remap, puis on échange les noms.
-- Les fonctions qui référencent le type dans leur SIGNATURE doivent être
-- supprimées avant le DROP TYPE puis recréées (sinon dépendance bloquante).

-- 1. Fonctions dépendantes du type (RETURNS TABLE ... stage_prospect).
DROP FUNCTION IF EXISTS get_prospect_time_in_stage_median();
DROP FUNCTION IF EXISTS find_prospect_duplicates(text, text);

-- Le trigger trg_prospects_stage_history épingle la colonne stage (UPDATE OF
-- stage) : impossible d'ALTER le type tant qu'il existe. On le drop ici et on
-- le recrée en fin de migration (sa fonction log_prospect_stage_change reste).
DROP TRIGGER IF EXISTS trg_prospects_stage_history ON prospects;

-- 2. Le DEFAULT de prospects.stage dépend de l'ancien type.
ALTER TABLE prospects ALTER COLUMN stage DROP DEFAULT;

-- 3. Nouvel enum.
CREATE TYPE stage_prospect_v2 AS ENUM (
  'a_qualifier',
  'presente',
  'cadre',
  'audite',
  'signe',
  'perdu'
);

-- 4. Bascule des colonnes avec remap (CASE via texte). Le CASE couvre les 4
--    valeurs existantes ; aucune autre n'est possible (contrainte d'enum).
ALTER TABLE prospects
  ALTER COLUMN stage TYPE stage_prospect_v2
  USING (
    CASE stage::text
      WHEN 'non_contacte' THEN 'a_qualifier'
      WHEN 'r1' THEN 'presente'
      WHEN 'r2' THEN 'cadre'
      WHEN 'signe' THEN 'signe'
    END
  )::stage_prospect_v2;

ALTER TABLE prospect_stage_history
  ALTER COLUMN from_stage TYPE stage_prospect_v2
  USING (
    CASE from_stage::text
      WHEN 'non_contacte' THEN 'a_qualifier'
      WHEN 'r1' THEN 'presente'
      WHEN 'r2' THEN 'cadre'
      WHEN 'signe' THEN 'signe'
      ELSE NULL
    END
  )::stage_prospect_v2;

ALTER TABLE prospect_stage_history
  ALTER COLUMN to_stage TYPE stage_prospect_v2
  USING (
    CASE to_stage::text
      WHEN 'non_contacte' THEN 'a_qualifier'
      WHEN 'r1' THEN 'presente'
      WHEN 'r2' THEN 'cadre'
      WHEN 'signe' THEN 'signe'
    END
  )::stage_prospect_v2;

-- 5. Restaure le DEFAULT (À qualifier).
ALTER TABLE prospects
  ALTER COLUMN stage SET DEFAULT 'a_qualifier'::stage_prospect_v2;

-- 6. Échange des noms.
DROP TYPE stage_prospect;
ALTER TYPE stage_prospect_v2 RENAME TO stage_prospect;

-- 7. Recrée les fonctions (référencent désormais l'enum 6 valeurs), à l'identique
--    de leur définition d'origine (20260428110000 / 20260615160400).
CREATE OR REPLACE FUNCTION get_prospect_time_in_stage_median()
RETURNS TABLE (
  from_stage stage_prospect,
  median_days NUMERIC,
  sample_size BIGINT
) AS $$
  WITH transitions AS (
    SELECT
      prospect_id,
      to_stage,
      changed_at,
      LAG(changed_at) OVER (PARTITION BY prospect_id ORDER BY changed_at) AS prev_at,
      LAG(to_stage)   OVER (PARTITION BY prospect_id ORDER BY changed_at) AS prev_stage
    FROM prospect_stage_history
  )
  SELECT
    prev_stage AS from_stage,
    ROUND(
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (changed_at - prev_at)) / 86400.0
      )::numeric,
      1
    ) AS median_days,
    COUNT(*)::bigint AS sample_size
  FROM transitions
  WHERE prev_at IS NOT NULL AND prev_stage IS NOT NULL
  GROUP BY prev_stage
  ORDER BY prev_stage;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER FUNCTION public.get_prospect_time_in_stage_median()
  SET search_path = public, pg_catalog;
REVOKE ALL ON FUNCTION public.get_prospect_time_in_stage_median() FROM public;
GRANT EXECUTE ON FUNCTION public.get_prospect_time_in_stage_median() TO authenticated;

CREATE OR REPLACE FUNCTION find_prospect_duplicates(
  p_nom   TEXT,
  p_siren TEXT DEFAULT NULL
)
RETURNS TABLE (
  id         UUID,
  nom        TEXT,
  siret      TEXT,
  stage      stage_prospect,
  similarite REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    p.id,
    p.nom,
    p.siret,
    p.stage,
    GREATEST(
      similarity(p.nom, p_nom),
      CASE
        WHEN p_siren IS NOT NULL
         AND (p.siren = p_siren OR p.siret LIKE p_siren || '%')
        THEN 1.0 ELSE 0.0
      END
    )::real AS similarite
  FROM prospects p
  WHERE p.archive = false
    AND (
      (p_siren IS NOT NULL AND (p.siren = p_siren OR p.siret LIKE p_siren || '%'))
      OR similarity(p.nom, p_nom) >= 0.5
    )
  ORDER BY similarite DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION find_prospect_duplicates(TEXT, TEXT) TO authenticated, anon;

-- 8. Recrée le trigger d'historisation (colonne stage au nouveau type).
CREATE TRIGGER trg_prospects_stage_history
  AFTER INSERT OR UPDATE OF stage ON prospects
  FOR EACH ROW EXECUTE FUNCTION log_prospect_stage_change();

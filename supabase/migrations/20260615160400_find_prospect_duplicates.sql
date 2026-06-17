-- Détection de doublons de prospect à la création (Feature 2 §7).
-- Bloque la création si : SIREN/SIRET identique, OU raison sociale très proche
-- (similarité trigram pg_trgm). search_path inclut extensions (où vit pg_trgm).
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

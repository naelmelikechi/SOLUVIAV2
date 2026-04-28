-- Historique des transitions de stage pour le pipeline commercial.
-- Permet de calculer time-in-stage median, velocite, drop-off par etape.

CREATE TABLE prospect_stage_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  from_stage   stage_prospect,                 -- NULL pour la creation
  to_stage     stage_prospect NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_prospect_stage_history_prospect
  ON prospect_stage_history(prospect_id, changed_at);
CREATE INDEX idx_prospect_stage_history_to_stage
  ON prospect_stage_history(to_stage, changed_at);

-- Trigger: log a la creation et a chaque changement de stage
CREATE OR REPLACE FUNCTION log_prospect_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO prospect_stage_history(prospect_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, NULL, NEW.stage, auth.uid());
  ELSIF (NEW.stage IS DISTINCT FROM OLD.stage) THEN
    INSERT INTO prospect_stage_history(prospect_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, OLD.stage, NEW.stage, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.log_prospect_stage_change() SET search_path = public, pg_catalog;

CREATE TRIGGER trg_prospects_stage_history
  AFTER INSERT OR UPDATE OF stage ON prospects
  FOR EACH ROW EXECUTE FUNCTION log_prospect_stage_change();

-- Backfill: une entree par prospect existant (creation du stage courant)
INSERT INTO prospect_stage_history (prospect_id, from_stage, to_stage, changed_at, changed_by)
SELECT id, NULL, stage, created_at, NULL
FROM prospects
WHERE NOT EXISTS (
  SELECT 1 FROM prospect_stage_history h WHERE h.prospect_id = prospects.id
);

-- RLS: lecture pour qui a acces au pipeline. Les ecritures passent par le trigger
-- (SECURITY DEFINER) ou par les admins.
ALTER TABLE prospect_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_read_prospect_stage_history ON prospect_stage_history
  FOR SELECT USING (has_pipeline_access());

CREATE POLICY admin_all_prospect_stage_history ON prospect_stage_history
  FOR ALL USING (is_admin());

-- RPC: time-in-stage median (en jours) pour chaque stage de depart.
-- Calcule la duree entre l entree dans un stage et la transition suivante.
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

ALTER FUNCTION public.get_prospect_time_in_stage_median() SET search_path = public, pg_catalog;

REVOKE ALL ON FUNCTION public.get_prospect_time_in_stage_median() FROM public;
GRANT EXECUTE ON FUNCTION public.get_prospect_time_in_stage_median() TO authenticated;

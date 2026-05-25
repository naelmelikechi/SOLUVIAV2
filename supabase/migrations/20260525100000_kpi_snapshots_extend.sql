-- Etend kpi_snapshots pour les requetes sparklines 12 mois par scope.
-- Pas de nouvelle colonne ni CHECK : type_kpi reste TEXT libre pour evolution.
-- Nouveaux type_kpi attendus (documente, non contraint) :
--   taux_qualiopi, pedagogie_avancement, taux_financement,
--   taux_abandon, taux_rupture, contrats_app, contrats_pdc, contrats_poe

CREATE INDEX IF NOT EXISTS kpi_snapshots_scope_type_mois_idx
  ON kpi_snapshots (scope, scope_id, type_kpi, mois DESC);

COMMENT ON INDEX kpi_snapshots_scope_type_mois_idx IS
  'Optimise les requetes sparkline : 12 derniers mois par scope+scope_id+type_kpi';

-- Corrige l'unicite de uq_snapshot quand scope_id IS NULL.
-- PostgreSQL ne considere pas NULL = NULL dans les contraintes UNIQUE standard,
-- donc deux lignes scope='global' (scope_id NULL) pouvaient coexister.
--
-- Strategie : deux index complementaires
--   1. uq_snapshot        : index fonctionnel COALESCE — couvre global (scope_id NULL)
--   2. uq_snapshot_scoped : index partiel WHERE scope_id IS NOT NULL — couvre projet/cdp
--      (PostgREST upsert onConflict peut cibler cet index via la liste de colonnes)
ALTER TABLE kpi_snapshots DROP CONSTRAINT IF EXISTS uq_snapshot;
CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshot
  ON kpi_snapshots (mois, type_kpi, scope, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshot_scoped
  ON kpi_snapshots (mois, type_kpi, scope, scope_id)
  WHERE scope_id IS NOT NULL;

COMMENT ON INDEX uq_snapshot IS
  'Unicite globale (mois, type_kpi, scope, scope_id) — COALESCE pour NULL (global scope)';
COMMENT ON INDEX uq_snapshot_scoped IS
  'Unicite projet/cdp (scope_id NOT NULL) — utilisee par PostgREST upsert onConflict';

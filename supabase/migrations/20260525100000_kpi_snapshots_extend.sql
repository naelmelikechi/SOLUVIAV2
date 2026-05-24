-- Etend kpi_snapshots pour les requetes sparklines 12 mois par scope.
-- Pas de nouvelle colonne ni CHECK : type_kpi reste TEXT libre pour evolution.
-- Nouveaux type_kpi attendus (documente, non contraint) :
--   taux_qualiopi, pedagogie_avancement, taux_financement,
--   taux_abandon, taux_rupture, contrats_app, contrats_pdc, contrats_poe

CREATE INDEX IF NOT EXISTS kpi_snapshots_scope_type_mois_idx
  ON kpi_snapshots (scope, scope_id, type_kpi, mois DESC);

COMMENT ON INDEX kpi_snapshots_scope_type_mois_idx IS
  'Optimise les requetes sparkline : 12 derniers mois par scope+scope_id+type_kpi';

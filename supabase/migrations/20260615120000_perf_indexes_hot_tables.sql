-- Perf : reindexe deux acces chauds confirmes par l'audit de perf (2026-06-15).
--
-- 1) audit_logs(created_at DESC) : /admin/audit fait
--    .order('created_at', desc).limit(100) (app/(dashboard)/admin/audit/page.tsx).
--    L'index dedie avait ete cree (20260511212331) PUIS droppe par le batch
--    "drop unused" (20260511225230) : pg_stat ne voyait aucun scan parce que la
--    base etait quasi vide en mai, pas parce que l'acces n'existe pas. audit_logs
--    est append-only et ne fait que grossir -> sans index, tri = seq scan + sort.
--
-- 2) factures(mois_concerne) : filtre de plage .gte/.lte sur le dashboard
--    (lib/queries/dashboard.ts getDashboardFinancials) et la page production
--    (lib/queries/production.ts). mois_concerne est un TEXT 'YYYY-MM' : l'ordre
--    lexical == l'ordre chronologique, une plage btree est donc correcte.
--    factures grossit en continu.
--
-- Plain CREATE INDEX (pas CONCURRENTLY) : compatible avec le runner de migration
-- transactionnel (scripts/migrate-supavia.ts) et homogene avec 00031_indexes.sql.
-- Volumetrie actuelle faible -> lock bref acceptable.

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_factures_mois_concerne
  ON public.factures (mois_concerne);

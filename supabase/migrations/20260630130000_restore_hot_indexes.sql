-- Restauration d'index chauds droppes a tort.
--
-- 20260511225230_drop_unused_indexes_phase1.sql a supprime 53 index en se
-- fiant a pg_stat_user_indexes.idx_scan = 0 alors que la base etait quasi vide
-- (mai 2026). idx_scan = 0 signifiait "pas encore de trafic/donnees", PAS
-- "acces inexistant" : faux signal. L'equipe a deja reconnu ce biais et recree
-- idx_audit_logs / idx_factures_mois_concerne dans 20260615120000.
--
-- Les 7 index ci-dessous back des filtres/joins reellement utilises (verifies
-- dans le code), sur des tables qui grossissent en continu :
--   - projets.statut          : .eq('statut','actif') (dashboard, snapshot, cron)
--   - factures.client_id      : join clients!inner + filtre archive (getFacturesList)
--   - echeances.facture_id    : lecture + UPDATE .eq('facture_id') (facturation)
--   - prospects.commercial_id : .eq('commercial_id') (KPI commerciaux scoped)
--   - apprenants.contrat_id   : join recherche globale + detail contrat
--   - notifications(subject_user_id) partiel : trigger auto-resolve a l'affectation CDP
--   - facturation_ajustements_pending.resolved_facture_id : .in(resolved_facture_id, ...)
--
-- IF NOT EXISTS : idempotent. Sur prod, 4 de ces index existent deja (drift :
-- jamais recrees cote repo apres le drop) -> no-op ; les 3 manquants
-- (projets.statut, prospects.commercial_id, notifications.subject_user) sont
-- crees. En local (reset depuis les migrations), les 7 sont recrees -> aligne
-- repo et prod. Lock bref (volume faible), aucun impact sur les invariants
-- factures (index transparents pour les triggers gapless/freeze).

CREATE INDEX IF NOT EXISTS idx_projets_statut ON public.projets (statut);
CREATE INDEX IF NOT EXISTS idx_factures_client_id ON public.factures (client_id);
CREATE INDEX IF NOT EXISTS idx_echeances_facture_id ON public.echeances (facture_id);
CREATE INDEX IF NOT EXISTS idx_prospects_commercial ON public.prospects (commercial_id);
CREATE INDEX IF NOT EXISTS idx_apprenants_contrat_id ON public.apprenants (contrat_id);
CREATE INDEX IF NOT EXISTS idx_notifications_subject_user
  ON public.notifications (subject_user_id)
  WHERE subject_user_id IS NOT NULL AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_facturation_ajustements_pending_resolved_facture_id
  ON public.facturation_ajustements_pending (resolved_facture_id);

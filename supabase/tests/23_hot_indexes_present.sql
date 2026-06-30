-- ===========================================================================
-- Test : presence des index chauds (garde-fou anti-drop)
-- ===========================================================================
-- 20260511225230_drop_unused_indexes_phase1.sql avait droppe 53 index sur un
-- idx_scan=0 trompeur (base quasi vide). 20260630130000_restore_hot_indexes.sql
-- en restaure 7 qui back des filtres/joins chauds verifies. Ce test echoue
-- bruyamment si l'un d'eux disparait de nouveau (regression).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(7);

SELECT ok((SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_projets_statut') = 1,
  'idx_projets_statut present (projets.statut)');
SELECT ok((SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_factures_client_id') = 1,
  'idx_factures_client_id present (factures.client_id)');
SELECT ok((SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_echeances_facture_id') = 1,
  'idx_echeances_facture_id present (echeances.facture_id)');
SELECT ok((SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_prospects_commercial') = 1,
  'idx_prospects_commercial present (prospects.commercial_id)');
SELECT ok((SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_apprenants_contrat_id') = 1,
  'idx_apprenants_contrat_id present (apprenants.contrat_id)');
SELECT ok((SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_notifications_subject_user') = 1,
  'idx_notifications_subject_user present (notifications.subject_user_id, partiel)');
SELECT ok((SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_facturation_ajustements_pending_resolved_facture_id') = 1,
  'idx_facturation_ajustements_pending_resolved_facture_id present');

SELECT * FROM finish();
ROLLBACK;

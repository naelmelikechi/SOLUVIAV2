-- ---------------------------------------------------------------------------
-- user_delete_fk_hardening : FK ON DELETE SET NULL pour les "resolved_by"
-- ---------------------------------------------------------------------------
-- Avant : echeanciers.resolved_by et bug_reports.resolved_by referencaient
-- users(id) / auth.users(id) sans clause ON DELETE. Consequence : le RPC
-- delete_user_cascade plantait avec une FK violation des qu un user avait
-- resolu une echeance ou un bug.
--
-- Apres : SET NULL. L'historique metier (echeance resolue, bug ferme) est
-- conserve ; seule la trace "qui a resolu" devient anonyme. Coherent avec
-- le pattern existant (projets.cdp_id, factures.created_by nullifies dans
-- le RPC delete_user_cascade).

ALTER TABLE echeanciers
  DROP CONSTRAINT IF EXISTS echeanciers_resolved_by_fkey,
  ADD CONSTRAINT echeanciers_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE bug_reports
  DROP CONSTRAINT IF EXISTS bug_reports_resolved_by_fkey,
  ADD CONSTRAINT bug_reports_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

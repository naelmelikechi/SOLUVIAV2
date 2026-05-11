-- Ajoute une policy SELECT pour admin/superadmin sur email_send_log.
--
-- Avant : RLS activee mais aucune policy -> seul service_role peut acceder.
-- Resultat : aucune observabilite cote admin sur les emails envoyes
-- (idempotence intercontrat hebdo, factures, etc.). Le lint 0008 Supabase
-- flag aussi.
--
-- Apres : les admins peuvent SELECT (read-only) pour debug. Pas d INSERT
-- ni UPDATE policy : seul service_role (cron / Server Actions) ecrit.

CREATE POLICY email_send_log_select_admin ON public.email_send_log
  FOR SELECT
  USING ((SELECT is_admin()));

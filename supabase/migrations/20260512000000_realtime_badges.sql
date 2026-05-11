-- Active la replication Realtime (publication supabase_realtime) pour les
-- tables ecoutees par useBadgeCounts cote client (sidebar badges +
-- notifications). Sans ca, les badges ne se mettent a jour qu au navigate
-- (initial fetch via fetchAllBadgeCounts) et jamais sur INSERT/UPDATE live.
--
-- Idempotent : on n ajoute la table que si elle n est pas deja dans la
-- publication. Permet de rejouer la migration sans erreur en cas de fix
-- manuel partiel cote Supabase Dashboard.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'bug_reports',
    'factures',
    'saisies_temps',
    'notifications',
    'projets',
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

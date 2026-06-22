-- Active la replication Realtime (publication supabase_realtime) pour
-- eduvia_invoice_steps, ecoutee par useBadgeCounts cote client pour le badge
-- "Contrats a facturer". Sans ca, le badge ne se met a jour qu au navigate
-- (initial fetch) et jamais sur le passage invoice_state -> TRANSMIS/REGLE
-- lors de la sync Eduvia. La RLS de eduvia_invoice_steps scope deja les
-- events par CDP (admin = tout).
--
-- Idempotent : on n ajoute la table que si elle n est pas deja dans la
-- publication. Rejouable sans erreur.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'eduvia_invoice_steps'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.eduvia_invoice_steps';
  END IF;
END $$;

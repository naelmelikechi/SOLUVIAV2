-- brain_ingest_runs : journal des exécutions du script LOCAL d'ingestion du
-- cerveau (`npm run brain:ingest`, scripts/brain-ingest.ts). Ce script tourne
-- à la main sur la machine d'un admin (il a besoin de la CLI `claude`
-- authentifiée sur un abonnement Max) : rien, côté app, ne sait s'il a tourné.
-- S'il n'est plus lancé, le cerveau cesse d'apprendre EN SILENCE (conversations,
-- entités, obsolescence). Ce journal rend cette panne visible dans /admin/syncs.
--
-- Analogue d'eduvia_sync_logs / odoo_sync_logs, à une nuance près : la ligne est
-- écrite AU DÉMARRAGE (statut 'running') puis mise à jour à la fin, pour qu'un
-- run interrompu brutalement (Ctrl-C, machine fermée) laisse quand même une
-- trace. Le mode --dry-run n'écrit rien.

create table if not exists public.brain_ingest_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  statut      text not null default 'running'
              check (statut in ('running', 'success', 'error')),
  erreur      text,
  -- Compteurs du run (fiches, livrables, conversations, entités, stale,
  -- inchangés, lacunes ouvertes) : la ligne de bilan du script, en jsonb.
  stats       jsonb
);

-- Seul accès utile : « le(s) dernier(s) run(s) », et « le dernier run réussi ».
create index if not exists brain_ingest_runs_started_idx
  on public.brain_ingest_runs (started_at desc);

alter table public.brain_ingest_runs enable row level security;

-- Lecture admin/superadmin uniquement (même garde que brain_proposals).
-- Les écritures viennent du script local via pg-meta (supabase_admin) : il
-- bypasse la RLS, pas de policy insert/update/delete pour `authenticated`.
create policy "runs d'ingestion lisibles par admin"
  on public.brain_ingest_runs for select to authenticated
  using ((select public.is_admin()));

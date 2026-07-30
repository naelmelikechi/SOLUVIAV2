-- Index de recherche des process finalisés synchronisés depuis Soluvia-Process.
-- Embeddings stockés en colonne float8[] (1536 dims, text-embedding-3-small).
-- Pas de pgvector (indisponible sur Supavia) : ranking cosinus en JS.
-- pg_trgm (déjà présent) sert de fallback recherche mots-clés.

create table if not exists public.process_index (
  id               uuid primary key default gen_random_uuid(),
  source_fiche_id  uuid not null unique,
  mission_code     text not null,
  mission_nom      text not null,
  fiche_code       text not null,
  titre            text not null,
  contenu          text not null,
  url              text not null,
  content_hash     text not null,
  embedding        float8[] not null,
  updated_at       timestamptz not null default now()
);

create index if not exists process_index_contenu_trgm
  on public.process_index using gin (contenu gin_trgm_ops);

alter table public.process_index enable row level security;

-- Lecture pour tout utilisateur authentifié (recherche). Écriture : service_role only
-- (le cron utilise createAdminClient qui bypass RLS ; aucune policy d'écriture => bloqué pour les users).
create policy "process_index lisible par les authentifiés"
  on public.process_index for select
  to authenticated using (true);

-- Fallback recherche mots-clés (pg_trgm) quand l'embedding de la requête échoue.
create or replace function public.search_process_trgm(q text)
returns setof public.process_index
language sql
stable
as $$
  select *
  from public.process_index
  order by similarity(contenu, q) desc
  limit 10;
$$;

create table if not exists public.brain_notes (
  id           uuid primary key default gen_random_uuid(),
  path         text unique not null,
  type         text not null check (type in ('fiche','livrable','conversation','entite')),
  title        text not null,
  aliases      text[] not null default '{}',
  tags         text[] not null default '{}',
  links        text[] not null default '{}',
  body         text not null,
  frontmatter  jsonb not null default '{}',
  source_ref   text,
  source_hash  text,
  updated_at   timestamptz not null default now()
);

create index if not exists brain_notes_type_idx on public.brain_notes (type);
create index if not exists brain_notes_source_ref_idx on public.brain_notes (source_ref);
create extension if not exists pg_trgm;
create index if not exists brain_notes_title_trgm on public.brain_notes using gin (title gin_trgm_ops);
create index if not exists brain_notes_body_trgm  on public.brain_notes using gin (body  gin_trgm_ops);

alter table public.brain_notes enable row level security;
create policy "brain lisible par admin"
  on public.brain_notes for select to authenticated
  using ((select public.is_admin()));

create or replace function public.search_brain_trgm(q text, k int default 6)
returns setof public.brain_notes
language sql stable
as $$
  select *
  from public.brain_notes
  where q <> '' and (title ilike '%'||q||'%' or body ilike '%'||q||'%'
        or similarity(title, q) > 0.1 or similarity(body, q) > 0.05)
  order by greatest(similarity(title, q), similarity(body, q)) desc
  limit greatest(k, 1);
$$;

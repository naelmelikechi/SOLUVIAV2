-- Propositions du cerveau : tout ce qui est DÉRIVÉ (conversations 👍, entités,
-- lacunes 👎, obsolescence) passe par une validation admin avant d'entrer dans
-- brain_notes. Les notes fiche/livrable/document restent écrites en direct par
-- le script d'ingestion : ce sont des reflets de sources de vérité.
create table if not exists public.brain_proposals (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('conversation','entite','lacune','obsolescence')),
  status      text not null default 'en_attente'
              check (status in ('en_attente','approuvee','rejetee','a_regenerer')),
  target_path text,
  payload     jsonb not null,
  source_ref  text not null,
  source_hash text not null,
  reason      text,
  decided_by  uuid references public.users(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (kind, source_ref)
);

create index if not exists brain_proposals_status_kind_idx
  on public.brain_proposals (status, kind);

alter table public.brain_proposals enable row level security;

create policy "propositions lisibles par admin"
  on public.brain_proposals for select to authenticated
  using ((select public.is_admin()));

create policy "propositions arbitrees par admin"
  on public.brain_proposals for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Lecture du cerveau : le contenu indexé (fiches finalisées, livrables et
-- documents Drive « SOLUVIA BRAIN », entités, conversations validées) est de la
-- documentation interne lisible par tout salarié. On ouvre donc le select à
-- `authenticated` et on supprime le contournement service-role de retrieveNotes
-- (cf. lib/brain/retrieve.ts) : la RLS redevient la seule source de vérité, et
-- le garde-fou porte sur ce qui ENTRE dans le cerveau (brain_proposals).
drop policy if exists "brain lisible par admin" on public.brain_notes;
create policy "brain lisible par tout utilisateur connecte"
  on public.brain_notes for select to authenticated
  using (true);

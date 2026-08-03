create table if not exists public.process_qa_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  question text not null,
  answer text not null,
  rating smallint not null check (rating in (-1, 1)),
  sources jsonb,
  created_at timestamptz not null default now()
);
alter table public.process_qa_feedback enable row level security;
create policy "feedback insert par l'auteur"
  on public.process_qa_feedback for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "feedback lisible par admin"
  on public.process_qa_feedback for select to authenticated
  using ((select public.is_admin()));

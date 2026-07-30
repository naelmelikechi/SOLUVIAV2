-- Détail structuré (miroir lecture seule) des fiches finalisées.
alter table public.process_index
  add column if not exists detail jsonb,
  add column if not exists detail_hash text;

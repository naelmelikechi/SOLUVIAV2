-- Phase 2 Lot C : preservation de la passation avant la suppression des prospects.
--
-- document_synthese.prospect_id est DEJA nullable + ON DELETE SET NULL (pose par
-- le chantier passation V2) : les syntheses survivent au DROP, rien a faire ici.
--
-- signature_requests, lui, est encore prospect_id NOT NULL + ON DELETE CASCADE.
-- On l'aligne sur document_synthese : ancrable sur un client, prospect_id
-- nullable, et FK en SET NULL (desamorce le CASCADE vers prospects qui disparait
-- en Lot D). Backfill client_id depuis prospects.client_id pour l'existant.
alter table public.signature_requests
  add column if not exists client_id uuid references public.clients(id) on delete set null;

alter table public.signature_requests alter column prospect_id drop not null;

alter table public.signature_requests
  drop constraint if exists signature_requests_prospect_id_fkey;
alter table public.signature_requests
  add constraint signature_requests_prospect_id_fkey
  foreign key (prospect_id) references public.prospects(id) on delete set null;

update public.signature_requests s
set client_id = p.client_id
from public.prospects p
where s.prospect_id = p.id
  and s.client_id is null
  and p.client_id is not null;

create index if not exists signature_requests_client_idx
  on public.signature_requests(client_id);

-- Phase 2 Lot B : back-link opportunite -> client SOLUVIA cree au passage
-- "gagnee". ON DELETE SET NULL : la suppression d'un client ne detruit pas
-- l'opportunite (historique commercial). Idempotence du pont = presence de
-- client_id (on ne recree pas si deja lie).
alter table crm.opportunites
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists opportunites_client_idx on crm.opportunites(client_id);

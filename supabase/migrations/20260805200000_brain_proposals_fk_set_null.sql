-- `decided_by` était en NO ACTION : dès qu'un admin aurait arbitré une
-- proposition, la suppression de son compte aurait échoué sur cette clé
-- étrangère (la RPC `delete_user_cascade` ne connaît pas cette table).
-- Convention du dépôt pour ce type de colonne d'auteur (`validee_par`,
-- `implementee_par`, `changed_by`, `soumise_par`) : ON DELETE SET NULL — on
-- garde la trace de l'arbitrage, on perd seulement l'identité de l'arbitre.
alter table public.brain_proposals
  drop constraint if exists brain_proposals_decided_by_fkey;

alter table public.brain_proposals
  add constraint brain_proposals_decided_by_fkey
  foreign key (decided_by) references public.users(id) on delete set null;

-- ============================================================================
-- CRM "perf" — schéma isolé monté dans SOLUVIA (phase 1, socle).
--
-- Duplication à la main du modèle de données du CRM commercial "perf"
-- (outilcommercialPerf) dans un schéma Postgres dédié `crm`, rebranché sur
-- les utilisateurs SOLUVIA (`public.users`) au lieu du miroir `profiles` de perf.
--
-- Ce que perf portait et qui est VOLONTAIREMENT ABANDONNÉ ici :
--   - table `profiles` (miroir auth.users) + `handle_new_user` + le trigger
--     `prevent_profile_priv_escalation` : SOLUVIA a déjà `public.users`.
--   - `public.is_admin()` de perf : SOLUVIA fournit `public.is_admin()` et
--     `public.has_pipeline_access()` (SECURITY DEFINER) réutilisés par les RLS.
--
-- Toutes les FK qui pointaient vers `profiles(id)` pointent désormais vers
-- `public.users(id)` en conservant la clause ON DELETE d'origine.
--
-- NB : cette migration n'est PAS encore appliquée. L'application sur Supabase
-- (dev/prod) + l'exposition du schéma `crm` dans le dashboard sont des étapes
-- de runbook réalisées manuellement.
-- ============================================================================

create schema if not exists crm;

-- updated_at auto (copie du body perf, namespacé crm)
create or replace function crm.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ETAPES (configurables) ------------------------------------------------------
create table crm.etapes (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  ordre int not null default 0,
  couleur text not null default '#4F46E5',
  type text not null default 'ouverte' check (type in ('ouverte','gagnee','perdue')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- COMPTES (entreprises) -------------------------------------------------------
create table crm.comptes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  secteur text,
  ville text,
  adresse text,
  site_web text,
  telephone text,
  siret text,
  statut text not null default 'prospect' check (statut in ('prospect','client','perdu')),
  source text,
  responsable_id uuid references public.users(id) on delete set null,
  notes text,
  nombre_collaborateurs int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comptes_nb_collaborateurs_positif check (nombre_collaborateurs > 0)
);
create trigger comptes_updated before update on crm.comptes for each row execute function crm.set_updated_at();

-- CONTACTS --------------------------------------------------------------------
create table crm.contacts (
  id uuid primary key default gen_random_uuid(),
  compte_id uuid not null references crm.comptes(id) on delete cascade,
  prenom text,
  nom text,
  fonction text,
  email text,
  telephone text,
  principal boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index contacts_compte_idx on crm.contacts(compte_id);

-- ADRESSES (établissements multiples par compte) ------------------------------
create table crm.adresses (
  id           uuid primary key default gen_random_uuid(),
  compte_id    uuid not null references crm.comptes(id) on delete cascade,
  libelle      text,
  ville        text,
  departement  text,
  region       text,
  principal    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index adresses_compte_idx      on crm.adresses(compte_id);
create index adresses_departement_idx on crm.adresses(departement);
create index adresses_region_idx      on crm.adresses(region);

-- OPPORTUNITES ----------------------------------------------------------------
create table crm.opportunites (
  id uuid primary key default gen_random_uuid(),
  intitule text not null,
  compte_id uuid not null references crm.comptes(id) on delete cascade,
  contact_principal_id uuid references crm.contacts(id) on delete set null,
  etape_id uuid not null references crm.etapes(id) on delete restrict,
  montant numeric(12,2) default 0,
  probabilite int default 0 check (probabilite between 0 and 100),
  date_cloture_prevue date,
  statut text not null default 'ouverte' check (statut in ('ouverte','gagnee','perdue')),
  motif_perte text,
  nb_alternants int default 1,
  formation_visee text,
  date_demarrage_souhaitee date,
  source text,
  cfa text,
  date_cible_prochain_rdv date,
  owner_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunites_montant_positif check (montant >= 0),
  constraint opportunites_nb_alternants_positif check (nb_alternants >= 0)
);
create trigger opportunites_updated before update on crm.opportunites for each row execute function crm.set_updated_at();
create index opportunites_compte_idx on crm.opportunites(compte_id);
create index opportunites_etape_idx on crm.opportunites(etape_id);
create index opportunites_owner_idx on crm.opportunites(owner_id);

-- ACTIVITES (timeline) --------------------------------------------------------
create table crm.activites (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'note' check (type in ('note','appel','email','systeme')),
  opportunite_id uuid references crm.opportunites(id) on delete cascade,
  compte_id uuid references crm.comptes(id) on delete cascade,
  auteur_id uuid references public.users(id) on delete set null,
  contenu text not null,
  created_at timestamptz not null default now()
);
create index activites_opp_idx on crm.activites(opportunite_id);
create index activites_compte_idx on crm.activites(compte_id);

-- RELANCES --------------------------------------------------------------------
create table crm.relances (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  opportunite_id uuid references crm.opportunites(id) on delete cascade,
  compte_id uuid references crm.comptes(id) on delete cascade,
  date_echeance date not null,
  fait boolean not null default false,
  date_fait timestamptz,
  assignee_id uuid references public.users(id) on delete set null,
  priorite text not null default 'normale' check (priorite in ('basse','normale','haute')),
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint relances_fait_coherent check (fait = (date_fait is not null))
);
create index relances_echeance_idx on crm.relances(date_echeance) where fait = false;
create index relances_actives_idx on crm.relances(date_echeance) where archived_at is null;
create index relances_opportunite_idx on crm.relances(opportunite_id);
create index relances_compte_idx on crm.relances(compte_id);
create index relances_assignee_idx on crm.relances(assignee_id);

-- RDV -------------------------------------------------------------------------
create table crm.rdv (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  debut timestamptz not null,
  fin timestamptz not null,
  lieu text,
  opportunite_id uuid references crm.opportunites(id) on delete cascade,
  compte_id uuid references crm.comptes(id) on delete cascade,
  notes_prep text,
  compte_rendu text,
  statut text not null default 'planifie' check (statut in ('planifie','realise','annule')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint rdv_fin_apres_debut check (fin >= debut)
);
create index rdv_debut_idx on crm.rdv(debut);
create index rdv_opportunite_idx on crm.rdv(opportunite_id);
create index rdv_compte_idx on crm.rdv(compte_id);

-- RDV_COMMERCIAUX (M2M : plusieurs commerciaux par RDV) -----------------------
-- perf : (rdv_id, profile_id) ; ici profile_id -> user_id -> public.users.
create table crm.rdv_commerciaux (
  rdv_id uuid not null references crm.rdv(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (rdv_id, user_id)
);
create index rdv_commerciaux_user_idx on crm.rdv_commerciaux(user_id);

-- NOTIFICATIONS ---------------------------------------------------------------
create table crm.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,  -- destinataire
  actor_id    uuid references public.users(id) on delete set null,          -- déclencheur
  type        text not null check (type in ('mention','rdv_assigned','relance_assigned')),
  contenu     text not null,
  link        text,
  lu          boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on crm.notifications(user_id, lu, created_at desc);

-- RECAPS (historique des récaps commerciaux envoyés) --------------------------
create table crm.recaps (
  id            uuid primary key default gen_random_uuid(),
  recap_date    date not null,
  trigger       text not null default 'cron' check (trigger in ('cron','manuel')),
  destinataires text not null,
  sujet         text not null,
  meta          jsonb,
  actor_id      uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index recaps_date_idx on crm.recaps(recap_date desc);
-- Idempotence : un seul récap 'cron' par jour.
create unique index recaps_cron_daily_idx on crm.recaps(recap_date) where trigger = 'cron';

-- ============================================================================
-- RPC : création unifiée transactionnelle (perf 0012), qualifiée crm.*.
-- SECURITY INVOKER : s'exécute avec le rôle de l'appelant (authenticated),
-- la RLS "pipeline" s'applique et auth.uid() renvoie l'utilisateur courant.
-- ============================================================================
create or replace function crm.create_opportunite_complete(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = crm, public, pg_temp
as $$
declare
  v_owner   uuid := auth.uid();
  v_compte  uuid;
  v_contact_principal uuid;
  v_etape   uuid;
  v_opp     uuid;
  v_rdv     uuid;
  v_cid     uuid;
  c         jsonb;
  a         jsonb;
  v_debut   timestamptz;
begin
  if v_owner is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  -- Étape « ouverte » active (obligatoire).
  select id into v_etape
  from crm.etapes
  where type = 'ouverte' and actif = true
  order by ordre
  limit 1;
  if v_etape is null then
    raise exception 'Aucune étape configurée';
  end if;

  -- 1. Société
  insert into crm.comptes (nom, nombre_collaborateurs, responsable_id, statut)
  values (
    p->'societe'->>'nom',
    nullif(p->'societe'->>'nombre_collaborateurs', '')::int,
    v_owner,
    'prospect'
  )
  returning id into v_compte;

  -- 2. Contacts (le flag `principal` désigne le contact principal).
  for c in select value from jsonb_array_elements(coalesce(p->'contacts', '[]'::jsonb)) t(value)
  loop
    insert into crm.contacts (compte_id, prenom, nom, email, telephone, principal)
    values (
      v_compte,
      nullif(c->>'prenom', ''),
      nullif(c->>'nom', ''),
      nullif(c->>'email', ''),
      nullif(c->>'telephone', ''),
      coalesce((c->>'principal')::boolean, false)
    )
    returning id into v_cid;
    if coalesce((c->>'principal')::boolean, false) then
      v_contact_principal := v_cid;
    end if;
  end loop;

  -- 2 bis. Adresses / établissements (déjà normalisées).
  for a in select value from jsonb_array_elements(coalesce(p->'adresses', '[]'::jsonb)) t(value)
  loop
    insert into crm.adresses (compte_id, libelle, ville, departement, region, principal)
    values (
      v_compte,
      nullif(a->>'libelle', ''),
      nullif(a->>'ville', ''),
      nullif(a->>'departement', ''),
      nullif(a->>'region', ''),
      coalesce((a->>'principal')::boolean, false)
    );
  end loop;

  -- 3. Opportunité (intitulé = nom de la société).
  insert into crm.opportunites (intitule, compte_id, contact_principal_id, etape_id, nb_alternants, cfa, date_cible_prochain_rdv, owner_id)
  values (
    p->'societe'->>'nom',
    v_compte,
    v_contact_principal,
    v_etape,
    nullif(p->'opportunite'->>'nb_alternants', '')::int,
    nullif(p->'opportunite'->>'cfa', ''),
    nullif(p->'opportunite'->>'date_cible_prochain_rdv', '')::date,
    v_owner
  )
  returning id into v_opp;

  -- 4. 1er RDV (si fourni) + liaison commercial.
  if coalesce(p->>'date_premier_rdv', '') <> '' then
    v_debut := (p->>'date_premier_rdv')::timestamptz;
    insert into crm.rdv (titre, debut, fin, opportunite_id, compte_id, created_by)
    values (
      'RDV - ' || (p->'societe'->>'nom'),
      v_debut,
      v_debut + interval '1 hour',
      v_opp,
      v_compte,
      v_owner
    )
    returning id into v_rdv;

    insert into crm.rdv_commerciaux (rdv_id, user_id) values (v_rdv, v_owner);
  end if;

  -- 5. Commentaire (si fourni) -> activité de type note.
  if coalesce(p->>'commentaire', '') <> '' then
    insert into crm.activites (type, opportunite_id, auteur_id, contenu)
    values ('note', v_opp, v_owner, p->>'commentaire');
  end if;

  return v_opp;
end;
$$;

-- Exécution réservée aux authentifiés (SECURITY INVOKER + RLS pipeline).
revoke execute on function crm.create_opportunite_complete(jsonb) from public;
grant execute on function crm.create_opportunite_complete(jsonb) to authenticated;

-- ============================================================================
-- RLS
-- ============================================================================
alter table crm.etapes           enable row level security;
alter table crm.comptes          enable row level security;
alter table crm.contacts         enable row level security;
alter table crm.adresses         enable row level security;
alter table crm.opportunites     enable row level security;
alter table crm.activites        enable row level security;
alter table crm.relances         enable row level security;
alter table crm.rdv              enable row level security;
alter table crm.rdv_commerciaux  enable row level security;
alter table crm.notifications    enable row level security;
alter table crm.recaps           enable row level security;

-- Tables métier partagées : accès pipeline (commerciaux) ou admin.
create policy crm_pipeline_all on crm.etapes
  for all using (public.has_pipeline_access() or public.is_admin())
  with check (public.has_pipeline_access() or public.is_admin());
create policy crm_pipeline_all on crm.comptes
  for all using (public.has_pipeline_access() or public.is_admin())
  with check (public.has_pipeline_access() or public.is_admin());
create policy crm_pipeline_all on crm.contacts
  for all using (public.has_pipeline_access() or public.is_admin())
  with check (public.has_pipeline_access() or public.is_admin());
create policy crm_pipeline_all on crm.adresses
  for all using (public.has_pipeline_access() or public.is_admin())
  with check (public.has_pipeline_access() or public.is_admin());
create policy crm_pipeline_all on crm.opportunites
  for all using (public.has_pipeline_access() or public.is_admin())
  with check (public.has_pipeline_access() or public.is_admin());
create policy crm_pipeline_all on crm.activites
  for all using (public.has_pipeline_access() or public.is_admin())
  with check (public.has_pipeline_access() or public.is_admin());
create policy crm_pipeline_all on crm.relances
  for all using (public.has_pipeline_access() or public.is_admin())
  with check (public.has_pipeline_access() or public.is_admin());
create policy crm_pipeline_all on crm.rdv
  for all using (public.has_pipeline_access() or public.is_admin())
  with check (public.has_pipeline_access() or public.is_admin());
create policy crm_pipeline_all on crm.rdv_commerciaux
  for all using (public.has_pipeline_access() or public.is_admin())
  with check (public.has_pipeline_access() or public.is_admin());

-- Notifications : strictement propriétaire (destinataire).
create policy crm_notifications_select on crm.notifications
  for select using (user_id = auth.uid());
create policy crm_notifications_update on crm.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy crm_notifications_delete on crm.notifications
  for delete using (user_id = auth.uid());
create policy crm_notifications_insert on crm.notifications
  for insert with check (actor_id = auth.uid());

-- Recaps : lecture admin ; insert manuel par l'admin déclencheur (le cron
-- passe en service_role et contourne la RLS).
create policy crm_recaps_select on crm.recaps
  for select using (public.is_admin());
create policy crm_recaps_insert on crm.recaps
  for insert with check (trigger = 'manuel' and actor_id = auth.uid());

-- ============================================================================
-- GRANTS : privilèges de schéma / tables / routines.
-- La RLS reste la garde principale ; ces grants ouvrent l'accès aux seuls
-- rôles applicatifs (jamais `anon`).
-- ============================================================================
grant usage on schema crm to authenticated, service_role;
grant select, insert, update, delete on all tables in schema crm to authenticated;
grant all on all tables in schema crm to service_role;
grant execute on all routines in schema crm to authenticated, service_role;

-- ============================================================================
-- SEED : 7 étapes standard (perf seed.sql).
-- ============================================================================
insert into crm.etapes (libelle, ordre, couleur, type) values
  ('À contacter',        1, '#64748b', 'ouverte'),
  ('Contact établi',     2, '#0ea5e9', 'ouverte'),
  ('RDV / Découverte',   3, '#6366f1', 'ouverte'),
  ('Proposition',        4, '#8b5cf6', 'ouverte'),
  ('Négociation',        5, '#f59e0b', 'ouverte'),
  ('Gagné',              6, '#22c55e', 'gagnee'),
  ('Perdu',              7, '#ef4444', 'perdue');

-- Alertes sante opportunites (reprise de la spec Feature 1 §5, adaptee au CRM :
-- remplace le cron prospect-alertes qui disparaitra avec les prospects).
-- Une opportunite ouverte sans activite > 14 j notifie son owner (in-app crm),
-- > 30 j alerte owner + Direction par mail. Idempotence par colonnes timestamp,
-- re-armees des qu'une nouvelle activite est plus recente que l'alerte posee.

alter table crm.opportunites
  add column if not exists alerte_sante_14_at timestamptz,
  add column if not exists alerte_sante_30_at timestamptz;

-- Poser un timestamp d'alerte ne doit PAS passer par le bump updated_at
-- generique : sinon la pose de l'alerte 14 j "reactive" l'opportunite
-- (updated_at compte comme activite) et l'alerte 30 j ne partirait jamais.
create or replace function crm.set_updated_at_opportunites()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'alerte_sante_14_at' - 'alerte_sante_30_at')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'alerte_sante_14_at' - 'alerte_sante_30_at') then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists opportunites_updated on crm.opportunites;
create trigger opportunites_updated
  before update on crm.opportunites
  for each row execute function crm.set_updated_at_opportunites();

-- Nouveau type de notification in-app CRM (le CHECK inline de crm_schema
-- s'appelle notifications_type_check par convention Postgres).
alter table crm.notifications drop constraint notifications_type_check;
alter table crm.notifications add constraint notifications_type_check
  check (type in ('mention', 'rdv_assigned', 'relance_assigned', 'sante_opportunite'));

-- Feature 7 : alertes de saturation des CDP (seuils 80 % / 95 %).
--
-- Memorise le dernier palier notifie pour chaque CDP afin de n'alerter que
-- sur franchissement (0 -> 80 -> 95) et de re-armer quand la charge redescend.
-- 0 = sous les seuils, 80 = orange notifie, 95 = rouge notifie.
alter table public.users
  add column if not exists cdp_seuil_alerte smallint not null default 0
    check (cdp_seuil_alerte in (0, 80, 95));

-- Inversion des flags is_demo : DEMO etait taggue comme reel et les vrais
-- clients (Heol Formation, FormaSud, Dupont Academy, NordFormation) etaient
-- taggues demo. Les KPIs production agreges (qui filtrent is_demo=false)
-- masquaient donc la production reelle.

update public.clients
set is_demo = true
where raison_sociale = 'DEMO';

update public.clients
set is_demo = false
where raison_sociale in (
  'Heol Formation',
  'FormaSud',
  'Dupont Academy',
  'NordFormation'
);

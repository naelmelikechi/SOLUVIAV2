-- Drop de la table morte production_mensuelle (creee dans 00009_finances.sql).
-- Plus aucun code applicatif ne la lit/ecrit depuis le passage au calcul live
-- de la production (computeContractSchedule, 2026-06-03). Le DROP TABLE
-- emporte automatiquement ses policies RLS (production_mensuelle_select/
-- insert/update/delete), son trigger updated_at et ses indexes
-- (idx_production_mois, idx_production_projet_mois).
DROP TABLE IF EXISTS public.production_mensuelle;

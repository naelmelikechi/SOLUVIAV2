-- Suppression du module qualite legacy.
-- Le suivi qualite/Qualiopi est desormais 100% via Eduvia (/qualiopi),
-- la table SOLUVIA-side n'a plus de raison d'etre.
-- CASCADE retire les RLS policies, triggers (trg_taches_qualite_updated,
-- trg_tache_qualite_stamp_realisation), index (idx_taches_*) et toute
-- contrainte FK (rien ne reference taches_qualite cote autres tables).

DROP TABLE IF EXISTS taches_qualite CASCADE;

-- Lien manuel client SOLUVIA -> projet Plane (workspace eduvia).
-- UUID Plane stocke en TEXT (systeme externe, pas de FK possible).
-- Nullable : un client sans mapping n'affiche pas de carte Taches.
-- Pas de nouvelle policy RLS : colonne portee par la table clients existante
-- (lecture par les roles habituels, ecriture via action admin).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS plane_project_id TEXT;

-- Cerveau — autorise le type de note `document` (ingestion du Drive SOLUVIA BRAIN).
-- ============================================================================
-- Les documents internes (procédures, trames, modèles…) du dossier Drive
-- « SOLUVIA BRAIN » sont ingérés comme notes `document`. On étend la contrainte
-- de type de brain_notes. Idempotent (drop if exists + add).
-- ============================================================================

alter table public.brain_notes drop constraint if exists brain_notes_type_check;
alter table public.brain_notes add constraint brain_notes_type_check
  check (type in ('fiche', 'livrable', 'conversation', 'entite', 'document'));

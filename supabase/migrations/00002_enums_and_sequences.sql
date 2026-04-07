-- Enums
CREATE TYPE role_utilisateur AS ENUM ('admin', 'cdp');
CREATE TYPE statut_projet AS ENUM ('actif', 'en_pause', 'termine', 'archive');
CREATE TYPE statut_facture AS ENUM ('a_emettre', 'emise', 'payee', 'en_retard', 'avoir');
CREATE TYPE type_notification AS ENUM (
  'facture_retard',
  'tache_retard',
  'rappel_temps',
  'periode_facturation',
  'erreur_sync'
);
CREATE TYPE scope_kpi AS ENUM ('global', 'projet', 'cdp');

-- Sequences for business reference generation
CREATE SEQUENCE seq_projet_ref START 1 INCREMENT 1;
CREATE SEQUENCE seq_contrat_ref START 1 INCREMENT 1;
-- Invoice sequence: gapless (French legal requirement)
-- NOTE: For strict gapless numbering, the trigger uses max()+1 instead of this sequence
CREATE SEQUENCE seq_facture_ref START 1 INCREMENT 1;

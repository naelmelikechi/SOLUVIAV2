-- Phase 2 A2 : champs negociation + enrichissement INSEE dans le pipeline CRM.
-- Objectif : que `buildSyntheseSnapshotFromOpportunite` (Lot B) lise tout depuis
-- crm.* sans intake separe. Colonnes nommees a l'identique des prospects pour
-- minimiser l'ecart de portage du builder de snapshot passation.
-- Les CHECK reprennent EXACTEMENT les unions applicatives de lib/utils/constants.ts
-- (CanalOrigine, RoleDecisionContact, TypeFormation, InitiateurContact, TypeProspect).

-- comptes : enrichissement INSEE (via lib/insee/recherche-entreprises.ts)
alter table crm.comptes
  add column if not exists forme_juridique text,
  add column if not exists siren text,
  add column if not exists code_naf text,
  add column if not exists naf_libelle text,
  add column if not exists effectif_tranche text,
  add column if not exists nb_implantations int
    check (nb_implantations is null or nb_implantations >= 0),
  add column if not exists ca_dernier_exercice numeric(14, 2)
    check (ca_dernier_exercice is null or ca_dernier_exercice >= 0),
  add column if not exists insee_verifie boolean not null default false;

-- contacts : role de decision + sensibilites (RoleDecisionContact)
alter table crm.contacts
  add column if not exists role_decision text
    check (role_decision is null or role_decision in
      ('signataire', 'sponsor', 'operationnel', 'drh', 'soutien')),
  add column if not exists sensibilites text;

-- opportunites : negociation + historique + contrat + calendrier + tunnel
alter table crm.opportunites
  add column if not exists perimetre_missions text,
  add column if not exists formations_rncp text[] not null default '{}',
  add column if not exists type_formation text
    check (type_formation is null or type_formation in
      ('presentiel', 'distanciel', 'hybride')),
  add column if not exists taux_npec numeric(6, 2)
    check (taux_npec is null or taux_npec >= 0),
  add column if not exists duree_contrat_ans numeric(4, 2)
    check (duree_contrat_ans is null or duree_contrat_ans >= 0),
  add column if not exists mois_demarrage int
    check (mois_demarrage is null or mois_demarrage between 1 and 12),
  add column if not exists volume_an1 int
    check (volume_an1 is null or volume_an1 >= 0),
  add column if not exists volume_an2 int
    check (volume_an2 is null or volume_an2 >= 0),
  add column if not exists volume_an3 int
    check (volume_an3 is null or volume_an3 >= 0),
  add column if not exists volume_garanti_seuil int
    check (volume_garanti_seuil is null or volume_garanti_seuil >= 0),
  add column if not exists leviers text[] not null default '{}',
  add column if not exists canal_origine text
    check (canal_origine is null or canal_origine in
      ('reseau_developpeur', 'reseau_direction', 'linkedin_auto', 'salon', 'apporteur', 'autre')),
  add column if not exists date_premier_contact date,
  add column if not exists initiateur text
    check (initiateur is null or initiateur in ('soluvia', 'prospect')),
  add column if not exists historique_synthese text,
  add column if not exists numero_contrat text,
  add column if not exists type_prospect text
    check (type_prospect is null or type_prospect in ('cfa', 'entreprise')),
  add column if not exists calendrier_previsionnel jsonb;

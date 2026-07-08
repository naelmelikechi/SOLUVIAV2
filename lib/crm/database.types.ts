// Types du schéma Postgres `crm` (CRM commercial "perf" monté dans SOLUVIA).
//
// HAND-AUTHORED — dérivé à la main des types du CRM Perf de référence.
// NE PAS régénérer via `supabase gen types` : le schéma `crm` est isolé et
// rebranché sur `public.users` (SOLUVIA), et ces types n'importent RIEN du
// repo perf. Le schéma est exposé sous la clé `crm` afin que
// `createServerClient<Database, 'crm'>(...)` typecheck côté application.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json }
  | Json[];

// Enums métier portés par des CHECK constraints (inlinés localement — aucune
// dépendance vers le repo perf).
export type OppStatut = 'ouverte' | 'gagnee' | 'perdue';
export type RdvStatut = 'planifie' | 'realise' | 'annule';
export type Priorite = 'basse' | 'normale' | 'haute';
export type EtapeType = 'ouverte' | 'gagnee' | 'perdue';
export type CompteStatut = 'prospect' | 'client' | 'perdu';
export type ActiviteType = 'note' | 'appel' | 'email' | 'systeme';
export type NotificationType = 'mention' | 'rdv_assigned' | 'relance_assigned';
export type RecapTrigger = 'cron' | 'manuel';
// Phase 2 (A2) — enums négociation/passation, alignés sur lib/utils/constants.ts.
export type CrmRoleDecision =
  | 'signataire'
  | 'sponsor'
  | 'operationnel'
  | 'drh'
  | 'soutien';
export type CrmTypeFormation = 'presentiel' | 'distanciel' | 'hybride';
export type CrmCanalOrigine =
  | 'reseau_developpeur'
  | 'reseau_direction'
  | 'linkedin_auto'
  | 'salon'
  | 'apporteur'
  | 'autre';
export type CrmInitiateur = 'soluvia' | 'prospect';
export type CrmTypeProspect = 'cfa' | 'entreprise';

export interface Database {
  crm: {
    Tables: {
      etapes: {
        Row: {
          id: string;
          libelle: string;
          ordre: number;
          couleur: string;
          type: EtapeType;
          actif: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          libelle: string;
          ordre?: number;
          couleur?: string;
          type?: EtapeType;
          actif?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          libelle?: string;
          ordre?: number;
          couleur?: string;
          type?: EtapeType;
          actif?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      comptes: {
        Row: {
          id: string;
          nom: string;
          secteur: string | null;
          ville: string | null;
          adresse: string | null;
          site_web: string | null;
          telephone: string | null;
          siret: string | null;
          statut: CompteStatut;
          source: string | null;
          responsable_id: string | null;
          notes: string | null;
          nombre_collaborateurs: number | null;
          forme_juridique: string | null;
          siren: string | null;
          code_naf: string | null;
          naf_libelle: string | null;
          effectif_tranche: string | null;
          nb_implantations: number | null;
          ca_dernier_exercice: number | null;
          insee_verifie: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nom: string;
          secteur?: string | null;
          ville?: string | null;
          adresse?: string | null;
          site_web?: string | null;
          telephone?: string | null;
          siret?: string | null;
          statut?: CompteStatut;
          source?: string | null;
          responsable_id?: string | null;
          notes?: string | null;
          nombre_collaborateurs?: number | null;
          forme_juridique?: string | null;
          siren?: string | null;
          code_naf?: string | null;
          naf_libelle?: string | null;
          effectif_tranche?: string | null;
          nb_implantations?: number | null;
          ca_dernier_exercice?: number | null;
          insee_verifie?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nom?: string;
          secteur?: string | null;
          ville?: string | null;
          adresse?: string | null;
          site_web?: string | null;
          telephone?: string | null;
          siret?: string | null;
          statut?: CompteStatut;
          source?: string | null;
          responsable_id?: string | null;
          notes?: string | null;
          nombre_collaborateurs?: number | null;
          forme_juridique?: string | null;
          siren?: string | null;
          code_naf?: string | null;
          naf_libelle?: string | null;
          effectif_tranche?: string | null;
          nb_implantations?: number | null;
          ca_dernier_exercice?: number | null;
          insee_verifie?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'comptes_responsable_id_fkey';
            columns: ['responsable_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      contacts: {
        Row: {
          id: string;
          compte_id: string;
          prenom: string | null;
          nom: string | null;
          fonction: string | null;
          email: string | null;
          telephone: string | null;
          principal: boolean;
          notes: string | null;
          role_decision: CrmRoleDecision | null;
          sensibilites: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          compte_id: string;
          prenom?: string | null;
          nom?: string | null;
          fonction?: string | null;
          email?: string | null;
          telephone?: string | null;
          principal?: boolean;
          notes?: string | null;
          role_decision?: CrmRoleDecision | null;
          sensibilites?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          compte_id?: string;
          prenom?: string | null;
          nom?: string | null;
          fonction?: string | null;
          email?: string | null;
          telephone?: string | null;
          principal?: boolean;
          notes?: string | null;
          role_decision?: CrmRoleDecision | null;
          sensibilites?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contacts_compte_id_fkey';
            columns: ['compte_id'];
            isOneToOne: false;
            referencedRelation: 'comptes';
            referencedColumns: ['id'];
          },
        ];
      };
      adresses: {
        Row: {
          id: string;
          compte_id: string;
          libelle: string | null;
          ville: string | null;
          departement: string | null;
          region: string | null;
          principal: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          compte_id: string;
          libelle?: string | null;
          ville?: string | null;
          departement?: string | null;
          region?: string | null;
          principal?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          compte_id?: string;
          libelle?: string | null;
          ville?: string | null;
          departement?: string | null;
          region?: string | null;
          principal?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'adresses_compte_id_fkey';
            columns: ['compte_id'];
            isOneToOne: false;
            referencedRelation: 'comptes';
            referencedColumns: ['id'];
          },
        ];
      };
      opportunites: {
        Row: {
          id: string;
          intitule: string;
          compte_id: string;
          contact_principal_id: string | null;
          etape_id: string;
          montant: number | null;
          probabilite: number | null;
          date_cloture_prevue: string | null;
          statut: OppStatut;
          motif_perte: string | null;
          nb_alternants: number | null;
          formation_visee: string | null;
          date_demarrage_souhaitee: string | null;
          source: string | null;
          cfa: string | null;
          date_cible_prochain_rdv: string | null;
          perimetre_missions: string | null;
          formations_rncp: string[];
          type_formation: CrmTypeFormation | null;
          taux_npec: number | null;
          duree_contrat_ans: number | null;
          mois_demarrage: number | null;
          volume_an1: number | null;
          volume_an2: number | null;
          volume_an3: number | null;
          volume_garanti_seuil: number | null;
          leviers: string[];
          canal_origine: CrmCanalOrigine | null;
          date_premier_contact: string | null;
          initiateur: CrmInitiateur | null;
          historique_synthese: string | null;
          numero_contrat: string | null;
          type_prospect: CrmTypeProspect | null;
          calendrier_previsionnel: Json | null;
          owner_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          intitule: string;
          compte_id: string;
          contact_principal_id?: string | null;
          etape_id: string;
          montant?: number | null;
          probabilite?: number | null;
          date_cloture_prevue?: string | null;
          statut?: OppStatut;
          motif_perte?: string | null;
          nb_alternants?: number | null;
          formation_visee?: string | null;
          date_demarrage_souhaitee?: string | null;
          source?: string | null;
          cfa?: string | null;
          date_cible_prochain_rdv?: string | null;
          perimetre_missions?: string | null;
          formations_rncp?: string[];
          type_formation?: CrmTypeFormation | null;
          taux_npec?: number | null;
          duree_contrat_ans?: number | null;
          mois_demarrage?: number | null;
          volume_an1?: number | null;
          volume_an2?: number | null;
          volume_an3?: number | null;
          volume_garanti_seuil?: number | null;
          leviers?: string[];
          canal_origine?: CrmCanalOrigine | null;
          date_premier_contact?: string | null;
          initiateur?: CrmInitiateur | null;
          historique_synthese?: string | null;
          numero_contrat?: string | null;
          type_prospect?: CrmTypeProspect | null;
          calendrier_previsionnel?: Json | null;
          owner_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          intitule?: string;
          compte_id?: string;
          contact_principal_id?: string | null;
          etape_id?: string;
          montant?: number | null;
          probabilite?: number | null;
          date_cloture_prevue?: string | null;
          statut?: OppStatut;
          motif_perte?: string | null;
          nb_alternants?: number | null;
          formation_visee?: string | null;
          date_demarrage_souhaitee?: string | null;
          source?: string | null;
          cfa?: string | null;
          date_cible_prochain_rdv?: string | null;
          perimetre_missions?: string | null;
          formations_rncp?: string[];
          type_formation?: CrmTypeFormation | null;
          taux_npec?: number | null;
          duree_contrat_ans?: number | null;
          mois_demarrage?: number | null;
          volume_an1?: number | null;
          volume_an2?: number | null;
          volume_an3?: number | null;
          volume_garanti_seuil?: number | null;
          leviers?: string[];
          canal_origine?: CrmCanalOrigine | null;
          date_premier_contact?: string | null;
          initiateur?: CrmInitiateur | null;
          historique_synthese?: string | null;
          numero_contrat?: string | null;
          type_prospect?: CrmTypeProspect | null;
          calendrier_previsionnel?: Json | null;
          owner_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'opportunites_compte_id_fkey';
            columns: ['compte_id'];
            isOneToOne: false;
            referencedRelation: 'comptes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunites_contact_principal_id_fkey';
            columns: ['contact_principal_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunites_etape_id_fkey';
            columns: ['etape_id'];
            isOneToOne: false;
            referencedRelation: 'etapes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunites_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      activites: {
        Row: {
          id: string;
          type: ActiviteType;
          opportunite_id: string | null;
          compte_id: string | null;
          auteur_id: string | null;
          contenu: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          type?: ActiviteType;
          opportunite_id?: string | null;
          compte_id?: string | null;
          auteur_id?: string | null;
          contenu: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: ActiviteType;
          opportunite_id?: string | null;
          compte_id?: string | null;
          auteur_id?: string | null;
          contenu?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activites_opportunite_id_fkey';
            columns: ['opportunite_id'];
            isOneToOne: false;
            referencedRelation: 'opportunites';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activites_compte_id_fkey';
            columns: ['compte_id'];
            isOneToOne: false;
            referencedRelation: 'comptes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activites_auteur_id_fkey';
            columns: ['auteur_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      relances: {
        Row: {
          id: string;
          titre: string;
          opportunite_id: string | null;
          compte_id: string | null;
          date_echeance: string;
          fait: boolean;
          date_fait: string | null;
          assignee_id: string | null;
          priorite: Priorite;
          note: string | null;
          created_by: string | null;
          created_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          titre: string;
          opportunite_id?: string | null;
          compte_id?: string | null;
          date_echeance: string;
          fait?: boolean;
          date_fait?: string | null;
          assignee_id?: string | null;
          priorite?: Priorite;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          titre?: string;
          opportunite_id?: string | null;
          compte_id?: string | null;
          date_echeance?: string;
          fait?: boolean;
          date_fait?: string | null;
          assignee_id?: string | null;
          priorite?: Priorite;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          archived_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'relances_opportunite_id_fkey';
            columns: ['opportunite_id'];
            isOneToOne: false;
            referencedRelation: 'opportunites';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'relances_compte_id_fkey';
            columns: ['compte_id'];
            isOneToOne: false;
            referencedRelation: 'comptes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'relances_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'relances_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      rdv: {
        Row: {
          id: string;
          titre: string;
          debut: string;
          fin: string;
          lieu: string | null;
          opportunite_id: string | null;
          compte_id: string | null;
          notes_prep: string | null;
          compte_rendu: string | null;
          statut: RdvStatut;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          titre: string;
          debut: string;
          fin: string;
          lieu?: string | null;
          opportunite_id?: string | null;
          compte_id?: string | null;
          notes_prep?: string | null;
          compte_rendu?: string | null;
          statut?: RdvStatut;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          titre?: string;
          debut?: string;
          fin?: string;
          lieu?: string | null;
          opportunite_id?: string | null;
          compte_id?: string | null;
          notes_prep?: string | null;
          compte_rendu?: string | null;
          statut?: RdvStatut;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rdv_opportunite_id_fkey';
            columns: ['opportunite_id'];
            isOneToOne: false;
            referencedRelation: 'opportunites';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rdv_compte_id_fkey';
            columns: ['compte_id'];
            isOneToOne: false;
            referencedRelation: 'comptes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rdv_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      rdv_commerciaux: {
        Row: {
          rdv_id: string;
          user_id: string;
        };
        Insert: {
          rdv_id: string;
          user_id: string;
        };
        Update: {
          rdv_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rdv_commerciaux_rdv_id_fkey';
            columns: ['rdv_id'];
            isOneToOne: false;
            referencedRelation: 'rdv';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rdv_commerciaux_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          actor_id: string | null;
          type: NotificationType;
          contenu: string;
          link: string | null;
          lu: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          actor_id?: string | null;
          type: NotificationType;
          contenu: string;
          link?: string | null;
          lu?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          actor_id?: string | null;
          type?: NotificationType;
          contenu?: string;
          link?: string | null;
          lu?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      recaps: {
        Row: {
          id: string;
          recap_date: string;
          trigger: RecapTrigger;
          destinataires: string;
          sujet: string;
          meta: Json | null;
          actor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recap_date: string;
          trigger?: RecapTrigger;
          destinataires: string;
          sujet: string;
          meta?: Json | null;
          actor_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          recap_date?: string;
          trigger?: RecapTrigger;
          destinataires?: string;
          sujet?: string;
          meta?: Json | null;
          actor_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recaps_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      // Création unifiée transactionnelle (migration crm_schema). Retourne l'id de l'opportunité.
      create_opportunite_complete: {
        Args: { p: Json };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

// Alias pratiques (Row par défaut).
export type Etape = Database['crm']['Tables']['etapes']['Row'];
export type Compte = Database['crm']['Tables']['comptes']['Row'];
export type Contact = Database['crm']['Tables']['contacts']['Row'];
export type Adresse = Database['crm']['Tables']['adresses']['Row'];
export type Opportunite = Database['crm']['Tables']['opportunites']['Row'];
export type Activite = Database['crm']['Tables']['activites']['Row'];
export type Relance = Database['crm']['Tables']['relances']['Row'];
export type Rdv = Database['crm']['Tables']['rdv']['Row'];
export type RdvCommercial = Database['crm']['Tables']['rdv_commerciaux']['Row'];
export type Notification = Database['crm']['Tables']['notifications']['Row'];
export type Recap = Database['crm']['Tables']['recaps']['Row'];

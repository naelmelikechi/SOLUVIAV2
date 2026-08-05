export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  crm: {
    Tables: {
      activites: {
        Row: {
          auteur_id: string | null;
          compte_id: string | null;
          contenu: string;
          created_at: string;
          id: string;
          opportunite_id: string | null;
          type: string;
        };
        Insert: {
          auteur_id?: string | null;
          compte_id?: string | null;
          contenu: string;
          created_at?: string;
          id?: string;
          opportunite_id?: string | null;
          type?: string;
        };
        Update: {
          auteur_id?: string | null;
          compte_id?: string | null;
          contenu?: string;
          created_at?: string;
          id?: string;
          opportunite_id?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activites_compte_id_fkey';
            columns: ['compte_id'];
            isOneToOne: false;
            referencedRelation: 'comptes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activites_opportunite_id_fkey';
            columns: ['opportunite_id'];
            isOneToOne: false;
            referencedRelation: 'opportunites';
            referencedColumns: ['id'];
          },
        ];
      };
      adresses: {
        Row: {
          compte_id: string;
          created_at: string;
          departement: string | null;
          id: string;
          libelle: string | null;
          principal: boolean;
          region: string | null;
          ville: string | null;
        };
        Insert: {
          compte_id: string;
          created_at?: string;
          departement?: string | null;
          id?: string;
          libelle?: string | null;
          principal?: boolean;
          region?: string | null;
          ville?: string | null;
        };
        Update: {
          compte_id?: string;
          created_at?: string;
          departement?: string | null;
          id?: string;
          libelle?: string | null;
          principal?: boolean;
          region?: string | null;
          ville?: string | null;
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
      comptes: {
        Row: {
          adresse: string | null;
          ca_dernier_exercice: number | null;
          code_naf: string | null;
          created_at: string;
          effectif_tranche: string | null;
          forme_juridique: string | null;
          id: string;
          insee_verifie: boolean;
          naf_libelle: string | null;
          nb_implantations: number | null;
          nom: string;
          nombre_collaborateurs: number | null;
          notes: string | null;
          responsable_id: string | null;
          secteur: string | null;
          siren: string | null;
          siret: string | null;
          site_web: string | null;
          source: string | null;
          statut: string;
          telephone: string | null;
          updated_at: string;
          ville: string | null;
        };
        Insert: {
          adresse?: string | null;
          ca_dernier_exercice?: number | null;
          code_naf?: string | null;
          created_at?: string;
          effectif_tranche?: string | null;
          forme_juridique?: string | null;
          id?: string;
          insee_verifie?: boolean;
          naf_libelle?: string | null;
          nb_implantations?: number | null;
          nom: string;
          nombre_collaborateurs?: number | null;
          notes?: string | null;
          responsable_id?: string | null;
          secteur?: string | null;
          siren?: string | null;
          siret?: string | null;
          site_web?: string | null;
          source?: string | null;
          statut?: string;
          telephone?: string | null;
          updated_at?: string;
          ville?: string | null;
        };
        Update: {
          adresse?: string | null;
          ca_dernier_exercice?: number | null;
          code_naf?: string | null;
          created_at?: string;
          effectif_tranche?: string | null;
          forme_juridique?: string | null;
          id?: string;
          insee_verifie?: boolean;
          naf_libelle?: string | null;
          nb_implantations?: number | null;
          nom?: string;
          nombre_collaborateurs?: number | null;
          notes?: string | null;
          responsable_id?: string | null;
          secteur?: string | null;
          siren?: string | null;
          siret?: string | null;
          site_web?: string | null;
          source?: string | null;
          statut?: string;
          telephone?: string | null;
          updated_at?: string;
          ville?: string | null;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          compte_id: string;
          created_at: string;
          email: string | null;
          fonction: string | null;
          id: string;
          nom: string | null;
          notes: string | null;
          prenom: string | null;
          principal: boolean;
          role_decision: string | null;
          sensibilites: string | null;
          telephone: string | null;
        };
        Insert: {
          compte_id: string;
          created_at?: string;
          email?: string | null;
          fonction?: string | null;
          id?: string;
          nom?: string | null;
          notes?: string | null;
          prenom?: string | null;
          principal?: boolean;
          role_decision?: string | null;
          sensibilites?: string | null;
          telephone?: string | null;
        };
        Update: {
          compte_id?: string;
          created_at?: string;
          email?: string | null;
          fonction?: string | null;
          id?: string;
          nom?: string | null;
          notes?: string | null;
          prenom?: string | null;
          principal?: boolean;
          role_decision?: string | null;
          sensibilites?: string | null;
          telephone?: string | null;
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
      etapes: {
        Row: {
          actif: boolean;
          couleur: string;
          created_at: string;
          id: string;
          libelle: string;
          ordre: number;
          type: string;
        };
        Insert: {
          actif?: boolean;
          couleur?: string;
          created_at?: string;
          id?: string;
          libelle: string;
          ordre?: number;
          type?: string;
        };
        Update: {
          actif?: boolean;
          couleur?: string;
          created_at?: string;
          id?: string;
          libelle?: string;
          ordre?: number;
          type?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          actor_id: string | null;
          contenu: string;
          created_at: string;
          id: string;
          link: string | null;
          lu: boolean;
          type: string;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          contenu: string;
          created_at?: string;
          id?: string;
          link?: string | null;
          lu?: boolean;
          type: string;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          contenu?: string;
          created_at?: string;
          id?: string;
          link?: string | null;
          lu?: boolean;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      opportunites: {
        Row: {
          alerte_sante_14_at: string | null;
          alerte_sante_30_at: string | null;
          calendrier_previsionnel: Json | null;
          canal_origine: string | null;
          cfa: string | null;
          client_id: string | null;
          compte_id: string;
          contact_principal_id: string | null;
          created_at: string;
          date_cible_prochain_rdv: string | null;
          date_cloture_prevue: string | null;
          date_demarrage_souhaitee: string | null;
          date_premier_contact: string | null;
          duree_contrat_ans: number | null;
          etape_id: string;
          formation_visee: string | null;
          formations_rncp: string[];
          historique_synthese: string | null;
          id: string;
          initiateur: string | null;
          intitule: string;
          leviers: string[];
          mois_demarrage: number | null;
          montant: number | null;
          motif_perte: string | null;
          nb_alternants: number | null;
          numero_contrat: string | null;
          owner_id: string | null;
          perimetre_missions: string | null;
          probabilite: number | null;
          source: string | null;
          statut: string;
          taux_npec: number | null;
          type_formation: string | null;
          type_prospect: string | null;
          updated_at: string;
          volume_an1: number | null;
          volume_an2: number | null;
          volume_an3: number | null;
          volume_garanti_seuil: number | null;
        };
        Insert: {
          alerte_sante_14_at?: string | null;
          alerte_sante_30_at?: string | null;
          calendrier_previsionnel?: Json | null;
          canal_origine?: string | null;
          cfa?: string | null;
          client_id?: string | null;
          compte_id: string;
          contact_principal_id?: string | null;
          created_at?: string;
          date_cible_prochain_rdv?: string | null;
          date_cloture_prevue?: string | null;
          date_demarrage_souhaitee?: string | null;
          date_premier_contact?: string | null;
          duree_contrat_ans?: number | null;
          etape_id: string;
          formation_visee?: string | null;
          formations_rncp?: string[];
          historique_synthese?: string | null;
          id?: string;
          initiateur?: string | null;
          intitule: string;
          leviers?: string[];
          mois_demarrage?: number | null;
          montant?: number | null;
          motif_perte?: string | null;
          nb_alternants?: number | null;
          numero_contrat?: string | null;
          owner_id?: string | null;
          perimetre_missions?: string | null;
          probabilite?: number | null;
          source?: string | null;
          statut?: string;
          taux_npec?: number | null;
          type_formation?: string | null;
          type_prospect?: string | null;
          updated_at?: string;
          volume_an1?: number | null;
          volume_an2?: number | null;
          volume_an3?: number | null;
          volume_garanti_seuil?: number | null;
        };
        Update: {
          alerte_sante_14_at?: string | null;
          alerte_sante_30_at?: string | null;
          calendrier_previsionnel?: Json | null;
          canal_origine?: string | null;
          cfa?: string | null;
          client_id?: string | null;
          compte_id?: string;
          contact_principal_id?: string | null;
          created_at?: string;
          date_cible_prochain_rdv?: string | null;
          date_cloture_prevue?: string | null;
          date_demarrage_souhaitee?: string | null;
          date_premier_contact?: string | null;
          duree_contrat_ans?: number | null;
          etape_id?: string;
          formation_visee?: string | null;
          formations_rncp?: string[];
          historique_synthese?: string | null;
          id?: string;
          initiateur?: string | null;
          intitule?: string;
          leviers?: string[];
          mois_demarrage?: number | null;
          montant?: number | null;
          motif_perte?: string | null;
          nb_alternants?: number | null;
          numero_contrat?: string | null;
          owner_id?: string | null;
          perimetre_missions?: string | null;
          probabilite?: number | null;
          source?: string | null;
          statut?: string;
          taux_npec?: number | null;
          type_formation?: string | null;
          type_prospect?: string | null;
          updated_at?: string;
          volume_an1?: number | null;
          volume_an2?: number | null;
          volume_an3?: number | null;
          volume_garanti_seuil?: number | null;
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
        ];
      };
      rdv: {
        Row: {
          compte_id: string | null;
          compte_rendu: string | null;
          created_at: string;
          created_by: string | null;
          debut: string;
          fin: string;
          id: string;
          lieu: string | null;
          notes_prep: string | null;
          opportunite_id: string | null;
          statut: string;
          titre: string;
        };
        Insert: {
          compte_id?: string | null;
          compte_rendu?: string | null;
          created_at?: string;
          created_by?: string | null;
          debut: string;
          fin: string;
          id?: string;
          lieu?: string | null;
          notes_prep?: string | null;
          opportunite_id?: string | null;
          statut?: string;
          titre: string;
        };
        Update: {
          compte_id?: string | null;
          compte_rendu?: string | null;
          created_at?: string;
          created_by?: string | null;
          debut?: string;
          fin?: string;
          id?: string;
          lieu?: string | null;
          notes_prep?: string | null;
          opportunite_id?: string | null;
          statut?: string;
          titre?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rdv_compte_id_fkey';
            columns: ['compte_id'];
            isOneToOne: false;
            referencedRelation: 'comptes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rdv_opportunite_id_fkey';
            columns: ['opportunite_id'];
            isOneToOne: false;
            referencedRelation: 'opportunites';
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
        ];
      };
      recaps: {
        Row: {
          actor_id: string | null;
          created_at: string;
          destinataires: string;
          id: string;
          meta: Json | null;
          recap_date: string;
          sujet: string;
          trigger: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          destinataires: string;
          id?: string;
          meta?: Json | null;
          recap_date: string;
          sujet: string;
          trigger?: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          destinataires?: string;
          id?: string;
          meta?: Json | null;
          recap_date?: string;
          sujet?: string;
          trigger?: string;
        };
        Relationships: [];
      };
      relances: {
        Row: {
          archived_at: string | null;
          assignee_id: string | null;
          compte_id: string | null;
          created_at: string;
          created_by: string | null;
          date_echeance: string;
          date_fait: string | null;
          fait: boolean;
          id: string;
          note: string | null;
          opportunite_id: string | null;
          priorite: string;
          titre: string;
        };
        Insert: {
          archived_at?: string | null;
          assignee_id?: string | null;
          compte_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_echeance: string;
          date_fait?: string | null;
          fait?: boolean;
          id?: string;
          note?: string | null;
          opportunite_id?: string | null;
          priorite?: string;
          titre: string;
        };
        Update: {
          archived_at?: string | null;
          assignee_id?: string | null;
          compte_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_echeance?: string;
          date_fait?: string | null;
          fait?: boolean;
          id?: string;
          note?: string | null;
          opportunite_id?: string | null;
          priorite?: string;
          titre?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'relances_compte_id_fkey';
            columns: ['compte_id'];
            isOneToOne: false;
            referencedRelation: 'comptes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'relances_opportunite_id_fkey';
            columns: ['opportunite_id'];
            isOneToOne: false;
            referencedRelation: 'opportunites';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_opportunite_complete: { Args: { p: Json }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      absences: {
        Row: {
          created_at: string;
          date_debut: string;
          date_fin: string;
          demi_jour_debut: boolean;
          demi_jour_fin: boolean;
          id: string;
          type: Database['public']['Enums']['absence_type'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date_debut: string;
          date_fin: string;
          demi_jour_debut?: boolean;
          demi_jour_fin?: boolean;
          id?: string;
          type: Database['public']['Enums']['absence_type'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date_debut?: string;
          date_fin?: string;
          demi_jour_debut?: boolean;
          demi_jour_fin?: boolean;
          id?: string;
          type?: Database['public']['Enums']['absence_type'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'absences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      apprenants: {
        Row: {
          address: string | null;
          birth_date: string | null;
          city: string | null;
          contrat_id: string | null;
          created_at: string;
          disabled_worker: boolean | null;
          eduvia_formation_id: number | null;
          eduvia_id: number;
          email: string | null;
          gender: string | null;
          id: string;
          internal_number: string | null;
          last_synced_at: string | null;
          learning_end_date: string | null;
          learning_start_date: string | null;
          nationality_code: number | null;
          nom: string | null;
          phone_number: string | null;
          postcode: string | null;
          prenom: string | null;
          source_client_id: string | null;
          status: string | null;
        };
        Insert: {
          address?: string | null;
          birth_date?: string | null;
          city?: string | null;
          contrat_id?: string | null;
          created_at?: string;
          disabled_worker?: boolean | null;
          eduvia_formation_id?: number | null;
          eduvia_id: number;
          email?: string | null;
          gender?: string | null;
          id?: string;
          internal_number?: string | null;
          last_synced_at?: string | null;
          learning_end_date?: string | null;
          learning_start_date?: string | null;
          nationality_code?: number | null;
          nom?: string | null;
          phone_number?: string | null;
          postcode?: string | null;
          prenom?: string | null;
          source_client_id?: string | null;
          status?: string | null;
        };
        Update: {
          address?: string | null;
          birth_date?: string | null;
          city?: string | null;
          contrat_id?: string | null;
          created_at?: string;
          disabled_worker?: boolean | null;
          eduvia_formation_id?: number | null;
          eduvia_id?: number;
          email?: string | null;
          gender?: string | null;
          id?: string;
          internal_number?: string | null;
          last_synced_at?: string | null;
          learning_end_date?: string | null;
          learning_start_date?: string | null;
          nationality_code?: number | null;
          nom?: string | null;
          phone_number?: string | null;
          postcode?: string | null;
          prenom?: string | null;
          source_client_id?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'apprenants_contrat_id_fkey';
            columns: ['contrat_id'];
            isOneToOne: false;
            referencedRelation: 'contrats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'apprenants_source_client_id_fkey';
            columns: ['source_client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          created_at: string | null;
          details: Json | null;
          entity_id: string | null;
          entity_type: string;
          id: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string | null;
          details?: Json | null;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string | null;
          details?: Json | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      axes_temps: {
        Row: {
          code: string;
          couleur: string | null;
          id: string;
          libelle: string;
          ordre: number;
        };
        Insert: {
          code: string;
          couleur?: string | null;
          id?: string;
          libelle: string;
          ordre?: number;
        };
        Update: {
          code?: string;
          couleur?: string | null;
          id?: string;
          libelle?: string;
          ordre?: number;
        };
        Relationships: [];
      };
      bank_lines_mirror: {
        Row: {
          created_at: string;
          date: string;
          id: string;
          montant: number;
          partner_name: string | null;
          payment_ref: string | null;
          raw: Json | null;
          societe_slug: string | null;
          source_app: string;
          source_external_id: number;
          synced_at: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          id?: string;
          montant: number;
          partner_name?: string | null;
          payment_ref?: string | null;
          raw?: Json | null;
          societe_slug?: string | null;
          source_app?: string;
          source_external_id: number;
          synced_at?: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: string;
          montant?: number;
          partner_name?: string | null;
          payment_ref?: string | null;
          raw?: Json | null;
          societe_slug?: string | null;
          source_app?: string;
          source_external_id?: number;
          synced_at?: string;
        };
        Relationships: [];
      };
      brain_notes: {
        Row: {
          aliases: string[];
          body: string;
          frontmatter: Json;
          id: string;
          links: string[];
          path: string;
          source_hash: string | null;
          source_ref: string | null;
          tags: string[];
          title: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          aliases?: string[];
          body: string;
          frontmatter?: Json;
          id?: string;
          links?: string[];
          path: string;
          source_hash?: string | null;
          source_ref?: string | null;
          tags?: string[];
          title: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          aliases?: string[];
          body?: string;
          frontmatter?: Json;
          id?: string;
          links?: string[];
          path?: string;
          source_hash?: string | null;
          source_ref?: string | null;
          tags?: string[];
          title?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brain_proposals: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          kind: string;
          payload: Json;
          reason: string | null;
          source_hash: string;
          source_ref: string;
          status: string;
          target_path: string | null;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          kind: string;
          payload: Json;
          reason?: string | null;
          source_hash: string;
          source_ref: string;
          status?: string;
          target_path?: string | null;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          kind?: string;
          payload?: Json;
          reason?: string | null;
          source_hash?: string;
          source_ref?: string;
          status?: string;
          target_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'brain_proposals_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      bug_reports: {
        Row: {
          ai_category: string | null;
          ai_error: string | null;
          ai_hypotheses: Json | null;
          ai_processed_at: string | null;
          ai_severity: string | null;
          ai_status: string;
          ai_summary: string | null;
          archive: boolean;
          auto_screenshot_path: string | null;
          comment: string;
          console_errors: Json | null;
          created_at: string;
          extra_context: Json | null;
          extra_screenshot_path: string | null;
          id: string;
          page_url: string;
          perceived_severity: string | null;
          ref: string | null;
          resolution_notes: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          screenshot_path: string | null;
          sentry_event_id: string | null;
          status: string;
          updated_at: string;
          user_agent: string | null;
          user_email: string;
          user_id: string | null;
          user_role: string;
          viewport: Json | null;
        };
        Insert: {
          ai_category?: string | null;
          ai_error?: string | null;
          ai_hypotheses?: Json | null;
          ai_processed_at?: string | null;
          ai_severity?: string | null;
          ai_status?: string;
          ai_summary?: string | null;
          archive?: boolean;
          auto_screenshot_path?: string | null;
          comment: string;
          console_errors?: Json | null;
          created_at?: string;
          extra_context?: Json | null;
          extra_screenshot_path?: string | null;
          id?: string;
          page_url: string;
          perceived_severity?: string | null;
          ref?: string | null;
          resolution_notes?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          screenshot_path?: string | null;
          sentry_event_id?: string | null;
          status?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_email: string;
          user_id?: string | null;
          user_role: string;
          viewport?: Json | null;
        };
        Update: {
          ai_category?: string | null;
          ai_error?: string | null;
          ai_hypotheses?: Json | null;
          ai_processed_at?: string | null;
          ai_severity?: string | null;
          ai_status?: string;
          ai_summary?: string | null;
          archive?: boolean;
          auto_screenshot_path?: string | null;
          comment?: string;
          console_errors?: Json | null;
          created_at?: string;
          extra_context?: Json | null;
          extra_screenshot_path?: string | null;
          id?: string;
          page_url?: string;
          perceived_severity?: string | null;
          ref?: string | null;
          resolution_notes?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          screenshot_path?: string | null;
          sentry_event_id?: string | null;
          status?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_email?: string;
          user_id?: string | null;
          user_role?: string;
          viewport?: Json | null;
        };
        Relationships: [];
      };
      categories_internes: {
        Row: {
          actif: boolean;
          archive: boolean;
          code: string;
          created_at: string;
          id: string;
          libelle: string;
          ordre: number;
          updated_at: string;
        };
        Insert: {
          actif?: boolean;
          archive?: boolean;
          code: string;
          created_at?: string;
          id?: string;
          libelle: string;
          ordre?: number;
          updated_at?: string;
        };
        Update: {
          actif?: boolean;
          archive?: boolean;
          code?: string;
          created_at?: string;
          id?: string;
          libelle?: string;
          ordre?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      cdp_affectation_history: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          client_id: string;
          from_cdp_id: string | null;
          id: string;
          justification: string | null;
          to_cdp_id: string | null;
        };
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          client_id: string;
          from_cdp_id?: string | null;
          id?: string;
          justification?: string | null;
          to_cdp_id?: string | null;
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          client_id?: string;
          from_cdp_id?: string | null;
          id?: string;
          justification?: string | null;
          to_cdp_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cdp_affectation_history_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cdp_affectation_history_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cdp_affectation_history_from_cdp_id_fkey';
            columns: ['from_cdp_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cdp_affectation_history_to_cdp_id_fkey';
            columns: ['to_cdp_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      client_api_keys: {
        Row: {
          api_key_encrypted: string;
          client_id: string;
          created_at: string;
          id: string;
          instance_url: string | null;
          is_active: boolean;
          label: string | null;
          last_sync_at: string | null;
          last_synced_at: string | null;
        };
        Insert: {
          api_key_encrypted: string;
          client_id: string;
          created_at?: string;
          id?: string;
          instance_url?: string | null;
          is_active?: boolean;
          label?: string | null;
          last_sync_at?: string | null;
          last_synced_at?: string | null;
        };
        Update: {
          api_key_encrypted?: string;
          client_id?: string;
          created_at?: string;
          id?: string;
          instance_url?: string | null;
          is_active?: boolean;
          label?: string | null;
          last_sync_at?: string | null;
          last_synced_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'client_api_keys_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      client_contacts: {
        Row: {
          client_id: string;
          created_at: string;
          email: string | null;
          id: string;
          nom: string;
          poste: string | null;
          recoit_factures: boolean;
          recoit_factures_cc: boolean;
          telephone: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          nom: string;
          poste?: string | null;
          recoit_factures?: boolean;
          recoit_factures_cc?: boolean;
          telephone?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          nom?: string;
          poste?: string | null;
          recoit_factures?: boolean;
          recoit_factures_cc?: boolean;
          telephone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'client_contacts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      client_documents: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          nom_fichier: string;
          storage_path: string;
          type_document: string | null;
          user_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          nom_fichier: string;
          storage_path: string;
          type_document?: string | null;
          user_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          nom_fichier?: string;
          storage_path?: string;
          type_document?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_documents_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_documents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      client_notes: {
        Row: {
          client_id: string;
          contenu: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          client_id: string;
          contenu: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          client_id?: string;
          contenu?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_notes_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_notes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      clients: {
        Row: {
          adresse: string | null;
          apporteur_commercial_id: string | null;
          apporteur_date: string | null;
          archive: boolean;
          cdp_affecte_at: string | null;
          cdp_referent_id: string | null;
          created_at: string;
          date_entree: string | null;
          id: string;
          is_demo: boolean;
          localisation: string | null;
          numero_nda: string | null;
          numero_qualiopi: string | null;
          numero_uai: string | null;
          plane_project_id: string | null;
          raison_sociale: string;
          siret: string | null;
          trigramme: string;
          tva_intracommunautaire: string | null;
          updated_at: string;
        };
        Insert: {
          adresse?: string | null;
          apporteur_commercial_id?: string | null;
          apporteur_date?: string | null;
          archive?: boolean;
          cdp_affecte_at?: string | null;
          cdp_referent_id?: string | null;
          created_at?: string;
          date_entree?: string | null;
          id?: string;
          is_demo?: boolean;
          localisation?: string | null;
          numero_nda?: string | null;
          numero_qualiopi?: string | null;
          numero_uai?: string | null;
          plane_project_id?: string | null;
          raison_sociale: string;
          siret?: string | null;
          trigramme: string;
          tva_intracommunautaire?: string | null;
          updated_at?: string;
        };
        Update: {
          adresse?: string | null;
          apporteur_commercial_id?: string | null;
          apporteur_date?: string | null;
          archive?: boolean;
          cdp_affecte_at?: string | null;
          cdp_referent_id?: string | null;
          created_at?: string;
          date_entree?: string | null;
          id?: string;
          is_demo?: boolean;
          localisation?: string | null;
          numero_nda?: string | null;
          numero_qualiopi?: string | null;
          numero_uai?: string | null;
          plane_project_id?: string | null;
          raison_sociale?: string;
          siret?: string | null;
          trigramme?: string;
          tva_intracommunautaire?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clients_apporteur_commercial_id_fkey';
            columns: ['apporteur_commercial_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clients_cdp_referent_id_fkey';
            columns: ['cdp_referent_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      contrats: {
        Row: {
          accepted_at: string | null;
          apprenant_nom: string | null;
          apprenant_prenom: string | null;
          archive: boolean;
          contract_conclusion_date: string | null;
          contract_mode: string | null;
          contract_number: string | null;
          contract_state: string;
          contract_type: string | null;
          created_at: string;
          creation_mode: string | null;
          date_debut: string | null;
          date_fin: string | null;
          date_rupture: string | null;
          deleted_in_eduvia_at: string | null;
          duree_mois: number | null;
          eduvia_campus_id: number | null;
          eduvia_company_id: number | null;
          eduvia_employee_id: number | null;
          eduvia_formation_id: number | null;
          eduvia_id: number;
          eduvia_teacher_id: number | null;
          facturation_verrouillee: boolean;
          formation_titre: string | null;
          id: string;
          internal_number: string | null;
          last_synced_at: string | null;
          npec_amount: number | null;
          practical_training_start_date: string | null;
          projet_id: string;
          ref: string | null;
          referrer_amount: number | null;
          referrer_name: string | null;
          referrer_type: string | null;
          source_client_id: string | null;
          support: number | null;
          support_first_equipment: number | null;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          apprenant_nom?: string | null;
          apprenant_prenom?: string | null;
          archive?: boolean;
          contract_conclusion_date?: string | null;
          contract_mode?: string | null;
          contract_number?: string | null;
          contract_state?: string;
          contract_type?: string | null;
          created_at?: string;
          creation_mode?: string | null;
          date_debut?: string | null;
          date_fin?: string | null;
          date_rupture?: string | null;
          deleted_in_eduvia_at?: string | null;
          duree_mois?: number | null;
          eduvia_campus_id?: number | null;
          eduvia_company_id?: number | null;
          eduvia_employee_id?: number | null;
          eduvia_formation_id?: number | null;
          eduvia_id: number;
          eduvia_teacher_id?: number | null;
          facturation_verrouillee?: boolean;
          formation_titre?: string | null;
          id?: string;
          internal_number?: string | null;
          last_synced_at?: string | null;
          npec_amount?: number | null;
          practical_training_start_date?: string | null;
          projet_id: string;
          ref?: string | null;
          referrer_amount?: number | null;
          referrer_name?: string | null;
          referrer_type?: string | null;
          source_client_id?: string | null;
          support?: number | null;
          support_first_equipment?: number | null;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          apprenant_nom?: string | null;
          apprenant_prenom?: string | null;
          archive?: boolean;
          contract_conclusion_date?: string | null;
          contract_mode?: string | null;
          contract_number?: string | null;
          contract_state?: string;
          contract_type?: string | null;
          created_at?: string;
          creation_mode?: string | null;
          date_debut?: string | null;
          date_fin?: string | null;
          date_rupture?: string | null;
          deleted_in_eduvia_at?: string | null;
          duree_mois?: number | null;
          eduvia_campus_id?: number | null;
          eduvia_company_id?: number | null;
          eduvia_employee_id?: number | null;
          eduvia_formation_id?: number | null;
          eduvia_id?: number;
          eduvia_teacher_id?: number | null;
          facturation_verrouillee?: boolean;
          formation_titre?: string | null;
          id?: string;
          internal_number?: string | null;
          last_synced_at?: string | null;
          npec_amount?: number | null;
          practical_training_start_date?: string | null;
          projet_id?: string;
          ref?: string | null;
          referrer_amount?: number | null;
          referrer_name?: string | null;
          referrer_type?: string | null;
          source_client_id?: string | null;
          support?: number | null;
          support_first_equipment?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contrats_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contrats_source_client_id_fkey';
            columns: ['source_client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      contrats_progressions: {
        Row: {
          average_score: number | null;
          completed_sequences_count: number | null;
          contrat_id: string;
          created_at: string;
          eduvia_contract_id: number;
          eduvia_formation_id: number | null;
          estimated_relative_time: number | null;
          id: string;
          last_activity_at: string | null;
          last_synced_at: string;
          progression_percentage: number | null;
          sequence_count: number | null;
          sequences: Json | null;
          total_spent_time_hours: number | null;
          total_spent_time_seconds: number | null;
        };
        Insert: {
          average_score?: number | null;
          completed_sequences_count?: number | null;
          contrat_id: string;
          created_at?: string;
          eduvia_contract_id: number;
          eduvia_formation_id?: number | null;
          estimated_relative_time?: number | null;
          id?: string;
          last_activity_at?: string | null;
          last_synced_at?: string;
          progression_percentage?: number | null;
          sequence_count?: number | null;
          sequences?: Json | null;
          total_spent_time_hours?: number | null;
          total_spent_time_seconds?: number | null;
        };
        Update: {
          average_score?: number | null;
          completed_sequences_count?: number | null;
          contrat_id?: string;
          created_at?: string;
          eduvia_contract_id?: number;
          eduvia_formation_id?: number | null;
          estimated_relative_time?: number | null;
          id?: string;
          last_activity_at?: string | null;
          last_synced_at?: string;
          progression_percentage?: number | null;
          sequence_count?: number | null;
          sequences?: Json | null;
          total_spent_time_hours?: number | null;
          total_spent_time_seconds?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contrats_progressions_contrat_id_fkey';
            columns: ['contrat_id'];
            isOneToOne: true;
            referencedRelation: 'contrats';
            referencedColumns: ['id'];
          },
        ];
      };
      devis: {
        Row: {
          acceptation_email: string | null;
          acceptation_ip: unknown;
          acceptation_nom: string | null;
          acceptation_token: string | null;
          acceptation_token_expire_at: string | null;
          acceptation_user_agent: string | null;
          client_id: string;
          conditions_reglement: string | null;
          created_at: string;
          created_by: string | null;
          date_acceptation: string | null;
          date_emission: string | null;
          date_envoi: string | null;
          date_refus: string | null;
          date_validite: string | null;
          devis_parent_id: string | null;
          id: string;
          montant_ht: number;
          montant_ttc: number;
          montant_tva: number;
          notes_internes: string | null;
          numero_seq: number | null;
          objet: string;
          pdf_locked: boolean;
          pdf_url: string | null;
          ref: string | null;
          refus_motif: string | null;
          relance_j14_envoyee_at: string | null;
          relance_j7_envoyee_at: string | null;
          relances_actives: boolean;
          societe_emettrice_id: string;
          statut: Database['public']['Enums']['statut_devis'];
          updated_at: string;
          version: number;
        };
        Insert: {
          acceptation_email?: string | null;
          acceptation_ip?: unknown;
          acceptation_nom?: string | null;
          acceptation_token?: string | null;
          acceptation_token_expire_at?: string | null;
          acceptation_user_agent?: string | null;
          client_id: string;
          conditions_reglement?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_acceptation?: string | null;
          date_emission?: string | null;
          date_envoi?: string | null;
          date_refus?: string | null;
          date_validite?: string | null;
          devis_parent_id?: string | null;
          id?: string;
          montant_ht?: number;
          montant_ttc?: number;
          montant_tva?: number;
          notes_internes?: string | null;
          numero_seq?: number | null;
          objet: string;
          pdf_locked?: boolean;
          pdf_url?: string | null;
          ref?: string | null;
          refus_motif?: string | null;
          relance_j14_envoyee_at?: string | null;
          relance_j7_envoyee_at?: string | null;
          relances_actives?: boolean;
          societe_emettrice_id: string;
          statut?: Database['public']['Enums']['statut_devis'];
          updated_at?: string;
          version?: number;
        };
        Update: {
          acceptation_email?: string | null;
          acceptation_ip?: unknown;
          acceptation_nom?: string | null;
          acceptation_token?: string | null;
          acceptation_token_expire_at?: string | null;
          acceptation_user_agent?: string | null;
          client_id?: string;
          conditions_reglement?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_acceptation?: string | null;
          date_emission?: string | null;
          date_envoi?: string | null;
          date_refus?: string | null;
          date_validite?: string | null;
          devis_parent_id?: string | null;
          id?: string;
          montant_ht?: number;
          montant_ttc?: number;
          montant_tva?: number;
          notes_internes?: string | null;
          numero_seq?: number | null;
          objet?: string;
          pdf_locked?: boolean;
          pdf_url?: string | null;
          ref?: string | null;
          refus_motif?: string | null;
          relance_j14_envoyee_at?: string | null;
          relance_j7_envoyee_at?: string | null;
          relances_actives?: boolean;
          societe_emettrice_id?: string;
          statut?: Database['public']['Enums']['statut_devis'];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'devis_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'devis_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'devis_devis_parent_id_fkey';
            columns: ['devis_parent_id'];
            isOneToOne: false;
            referencedRelation: 'devis';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'devis_societe_emettrice_id_fkey';
            columns: ['societe_emettrice_id'];
            isOneToOne: false;
            referencedRelation: 'societes_emettrices';
            referencedColumns: ['id'];
          },
        ];
      };
      devis_lignes: {
        Row: {
          created_at: string;
          description: string | null;
          devis_id: string;
          id: string;
          libelle: string;
          ordre: number;
          prix_unitaire_ht: number;
          quantite: number;
          taux_tva: number;
          total_ht: number;
          total_ttc: number;
          total_tva: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          devis_id: string;
          id?: string;
          libelle: string;
          ordre: number;
          prix_unitaire_ht: number;
          quantite?: number;
          taux_tva?: number;
          total_ht: number;
          total_ttc: number;
          total_tva: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          devis_id?: string;
          id?: string;
          libelle?: string;
          ordre?: number;
          prix_unitaire_ht?: number;
          quantite?: number;
          taux_tva?: number;
          total_ht?: number;
          total_ttc?: number;
          total_tva?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'devis_lignes_devis_id_fkey';
            columns: ['devis_id'];
            isOneToOne: false;
            referencedRelation: 'devis';
            referencedColumns: ['id'];
          },
        ];
      };
      devis_public_views: {
        Row: {
          devis_id: string;
          id: string;
          ip: unknown;
          token: string;
          user_agent: string | null;
          viewed_at: string;
        };
        Insert: {
          devis_id: string;
          id?: string;
          ip?: unknown;
          token: string;
          user_agent?: string | null;
          viewed_at?: string;
        };
        Update: {
          devis_id?: string;
          id?: string;
          ip?: unknown;
          token?: string;
          user_agent?: string | null;
          viewed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'devis_public_views_devis_id_fkey';
            columns: ['devis_id'];
            isOneToOne: false;
            referencedRelation: 'devis';
            referencedColumns: ['id'];
          },
        ];
      };
      document_synthese: {
        Row: {
          client_id: string | null;
          contenu: Json | null;
          created_at: string;
          diffuse_vague1_at: string | null;
          diffuse_vague2_at: string | null;
          escalade_dev_at: string | null;
          escalade_direction_at: string | null;
          genere_par: string | null;
          id: string;
          pdf_path_cdp: string | null;
          pdf_path_complet: string | null;
          points_vigilance: string | null;
          promesses_orales: string | null;
          prospect_id: string | null;
          rappel_dev_at: string | null;
          rappel_referent_at: string | null;
          reference_dossier: string | null;
          signature_id: string | null;
          signature_signee_at: string | null;
          soumise_at: string | null;
          soumise_par: string | null;
          statut: Database['public']['Enums']['statut_synthese'];
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          contenu?: Json | null;
          created_at?: string;
          diffuse_vague1_at?: string | null;
          diffuse_vague2_at?: string | null;
          escalade_dev_at?: string | null;
          escalade_direction_at?: string | null;
          genere_par?: string | null;
          id?: string;
          pdf_path_cdp?: string | null;
          pdf_path_complet?: string | null;
          points_vigilance?: string | null;
          promesses_orales?: string | null;
          prospect_id?: string | null;
          rappel_dev_at?: string | null;
          rappel_referent_at?: string | null;
          reference_dossier?: string | null;
          signature_id?: string | null;
          signature_signee_at?: string | null;
          soumise_at?: string | null;
          soumise_par?: string | null;
          statut?: Database['public']['Enums']['statut_synthese'];
          updated_at?: string;
        };
        Update: {
          client_id?: string | null;
          contenu?: Json | null;
          created_at?: string;
          diffuse_vague1_at?: string | null;
          diffuse_vague2_at?: string | null;
          escalade_dev_at?: string | null;
          escalade_direction_at?: string | null;
          genere_par?: string | null;
          id?: string;
          pdf_path_cdp?: string | null;
          pdf_path_complet?: string | null;
          points_vigilance?: string | null;
          promesses_orales?: string | null;
          prospect_id?: string | null;
          rappel_dev_at?: string | null;
          rappel_referent_at?: string | null;
          reference_dossier?: string | null;
          signature_id?: string | null;
          signature_signee_at?: string | null;
          soumise_at?: string | null;
          soumise_par?: string | null;
          statut?: Database['public']['Enums']['statut_synthese'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_synthese_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_synthese_genere_par_fkey';
            columns: ['genere_par'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_synthese_signature_id_fkey';
            columns: ['signature_id'];
            isOneToOne: false;
            referencedRelation: 'signature_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_synthese_soumise_par_fkey';
            columns: ['soumise_par'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      document_synthese_reco: {
        Row: {
          cdp_a_eviter: string | null;
          cdp_ideal: string | null;
          charge_previsionnelle:
            | Database['public']['Enums']['niveau_charge']
            | null;
          created_at: string;
          notes_inter_equipe: string | null;
          risque_churn: Database['public']['Enums']['niveau_risque'] | null;
          synthese_id: string;
          typologie_client:
            | Database['public']['Enums']['typologie_client']
            | null;
          updated_at: string;
        };
        Insert: {
          cdp_a_eviter?: string | null;
          cdp_ideal?: string | null;
          charge_previsionnelle?:
            | Database['public']['Enums']['niveau_charge']
            | null;
          created_at?: string;
          notes_inter_equipe?: string | null;
          risque_churn?: Database['public']['Enums']['niveau_risque'] | null;
          synthese_id: string;
          typologie_client?:
            | Database['public']['Enums']['typologie_client']
            | null;
          updated_at?: string;
        };
        Update: {
          cdp_a_eviter?: string | null;
          cdp_ideal?: string | null;
          charge_previsionnelle?:
            | Database['public']['Enums']['niveau_charge']
            | null;
          created_at?: string;
          notes_inter_equipe?: string | null;
          risque_churn?: Database['public']['Enums']['niveau_risque'] | null;
          synthese_id?: string;
          typologie_client?:
            | Database['public']['Enums']['typologie_client']
            | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_synthese_reco_synthese_id_fkey';
            columns: ['synthese_id'];
            isOneToOne: true;
            referencedRelation: 'document_synthese';
            referencedColumns: ['id'];
          },
        ];
      };
      document_template_versions: {
        Row: {
          active: boolean;
          fichier_nom: string | null;
          id: string;
          notes: string | null;
          published_at: string;
          published_by: string | null;
          storage_path: string;
          template_id: string;
          version: number;
        };
        Insert: {
          active?: boolean;
          fichier_nom?: string | null;
          id?: string;
          notes?: string | null;
          published_at?: string;
          published_by?: string | null;
          storage_path: string;
          template_id: string;
          version: number;
        };
        Update: {
          active?: boolean;
          fichier_nom?: string | null;
          id?: string;
          notes?: string | null;
          published_at?: string;
          published_by?: string | null;
          storage_path?: string;
          template_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'document_template_versions_published_by_fkey';
            columns: ['published_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_template_versions_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'document_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      document_templates: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          nom: string;
          ordre: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          nom: string;
          ordre?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          nom?: string;
          ordre?: number;
        };
        Relationships: [];
      };
      donnees_financieres: {
        Row: {
          contrat_id: string;
          created_at: string;
          duree_reelle_mois: number | null;
          id: string;
          last_synced_at: string | null;
          montant_contrat: number | null;
          projet_id: string;
          updated_at: string;
        };
        Insert: {
          contrat_id: string;
          created_at?: string;
          duree_reelle_mois?: number | null;
          id?: string;
          last_synced_at?: string | null;
          montant_contrat?: number | null;
          projet_id: string;
          updated_at?: string;
        };
        Update: {
          contrat_id?: string;
          created_at?: string;
          duree_reelle_mois?: number | null;
          id?: string;
          last_synced_at?: string | null;
          montant_contrat?: number | null;
          projet_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'donnees_financieres_contrat_id_fkey';
            columns: ['contrat_id'];
            isOneToOne: false;
            referencedRelation: 'contrats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'donnees_financieres_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
        ];
      };
      echeances: {
        Row: {
          created_at: string;
          date_emission_prevue: string;
          facture_id: string | null;
          id: string;
          mois_concerne: string;
          mois_relatif: number | null;
          montant_prevu_ht: number;
          npec_snapshot: number | null;
          projet_id: string;
          quote_part: number | null;
          updated_at: string;
          validee: boolean;
        };
        Insert: {
          created_at?: string;
          date_emission_prevue: string;
          facture_id?: string | null;
          id?: string;
          mois_concerne: string;
          mois_relatif?: number | null;
          montant_prevu_ht: number;
          npec_snapshot?: number | null;
          projet_id: string;
          quote_part?: number | null;
          updated_at?: string;
          validee?: boolean;
        };
        Update: {
          created_at?: string;
          date_emission_prevue?: string;
          facture_id?: string | null;
          id?: string;
          mois_concerne?: string;
          mois_relatif?: number | null;
          montant_prevu_ht?: number;
          npec_snapshot?: number | null;
          projet_id?: string;
          quote_part?: number | null;
          updated_at?: string;
          validee?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'echeances_facture_id_fkey';
            columns: ['facture_id'];
            isOneToOne: false;
            referencedRelation: 'factures';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'echeances_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
        ];
      };
      echeanciers_templates: {
        Row: {
          archive: boolean;
          created_at: string;
          description: string | null;
          id: string;
          is_default: boolean;
          jalons: Json;
          nom: string;
          updated_at: string;
        };
        Insert: {
          archive?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_default?: boolean;
          jalons: Json;
          nom: string;
          updated_at?: string;
        };
        Update: {
          archive?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_default?: boolean;
          jalons?: Json;
          nom?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      eduvia_companies: {
        Row: {
          address: string | null;
          city: string | null;
          client_id: string | null;
          country: string | null;
          created_at: string;
          denomination: string | null;
          eduvia_campus_id: number | null;
          eduvia_id: number;
          employee_count: number | null;
          employer_type: string | null;
          id: string;
          idcc_code: string | null;
          last_synced_at: string | null;
          naf: string | null;
          postcode: string | null;
          siret: string | null;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          client_id?: string | null;
          country?: string | null;
          created_at?: string;
          denomination?: string | null;
          eduvia_campus_id?: number | null;
          eduvia_id: number;
          employee_count?: number | null;
          employer_type?: string | null;
          id?: string;
          idcc_code?: string | null;
          last_synced_at?: string | null;
          naf?: string | null;
          postcode?: string | null;
          siret?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          client_id?: string | null;
          country?: string | null;
          created_at?: string;
          denomination?: string | null;
          eduvia_campus_id?: number | null;
          eduvia_id?: number;
          employee_count?: number | null;
          employer_type?: string | null;
          id?: string;
          idcc_code?: string | null;
          last_synced_at?: string | null;
          naf?: string | null;
          postcode?: string | null;
          siret?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'eduvia_companies_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      eduvia_invoice_forecast_steps: {
        Row: {
          contrat_id: string;
          created_at: string;
          eduvia_contract_id: number;
          eduvia_id: number;
          id: string;
          last_synced_at: string;
          npec_amount: number | null;
          opening_date: string | null;
          percentage: number | null;
          source_client_id: string | null;
          step_number: number;
          total_amount: number | null;
        };
        Insert: {
          contrat_id: string;
          created_at?: string;
          eduvia_contract_id: number;
          eduvia_id: number;
          id?: string;
          last_synced_at?: string;
          npec_amount?: number | null;
          opening_date?: string | null;
          percentage?: number | null;
          source_client_id?: string | null;
          step_number: number;
          total_amount?: number | null;
        };
        Update: {
          contrat_id?: string;
          created_at?: string;
          eduvia_contract_id?: number;
          eduvia_id?: number;
          id?: string;
          last_synced_at?: string;
          npec_amount?: number | null;
          opening_date?: string | null;
          percentage?: number | null;
          source_client_id?: string | null;
          step_number?: number;
          total_amount?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'eduvia_invoice_forecast_steps_contrat_id_fkey';
            columns: ['contrat_id'];
            isOneToOne: false;
            referencedRelation: 'contrats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'eduvia_invoice_forecast_steps_source_client_id_fkey';
            columns: ['source_client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      eduvia_invoice_lines: {
        Row: {
          amount: number;
          contrat_id: string;
          created_at: string;
          description: string | null;
          eduvia_created_at: string | null;
          eduvia_id: number;
          eduvia_invoice_id: number;
          eduvia_updated_at: string | null;
          id: string;
          last_synced_at: string;
          line_type: string;
          quantity: number;
          source_client_id: string;
        };
        Insert: {
          amount: number;
          contrat_id: string;
          created_at?: string;
          description?: string | null;
          eduvia_created_at?: string | null;
          eduvia_id: number;
          eduvia_invoice_id: number;
          eduvia_updated_at?: string | null;
          id?: string;
          last_synced_at?: string;
          line_type: string;
          quantity?: number;
          source_client_id: string;
        };
        Update: {
          amount?: number;
          contrat_id?: string;
          created_at?: string;
          description?: string | null;
          eduvia_created_at?: string | null;
          eduvia_id?: number;
          eduvia_invoice_id?: number;
          eduvia_updated_at?: string | null;
          id?: string;
          last_synced_at?: string;
          line_type?: string;
          quantity?: number;
          source_client_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'eduvia_invoice_lines_contrat_id_fkey';
            columns: ['contrat_id'];
            isOneToOne: false;
            referencedRelation: 'contrats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'eduvia_invoice_lines_source_client_id_fkey';
            columns: ['source_client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      eduvia_invoice_steps: {
        Row: {
          contrat_id: string;
          created_at: string;
          eduvia_contract_id: number;
          eduvia_id: number;
          eduvia_invoice_id: number | null;
          external_code: string | null;
          external_number: string | null;
          id: string;
          in_progress_amount: number | null;
          including_pedagogie_amount: number | null;
          including_rqth_amount: number | null;
          invoice_number: string | null;
          invoice_sent_at: string | null;
          invoice_state: string | null;
          last_synced_at: string;
          net_invoiced_amount: number | null;
          opco_settled_amount: number | null;
          opening_date: string | null;
          paid_amount: number | null;
          paid_at: string | null;
          siret_cfa: string | null;
          source_client_id: string | null;
          step_number: number;
          total_amount: number | null;
        };
        Insert: {
          contrat_id: string;
          created_at?: string;
          eduvia_contract_id: number;
          eduvia_id: number;
          eduvia_invoice_id?: number | null;
          external_code?: string | null;
          external_number?: string | null;
          id?: string;
          in_progress_amount?: number | null;
          including_pedagogie_amount?: number | null;
          including_rqth_amount?: number | null;
          invoice_number?: string | null;
          invoice_sent_at?: string | null;
          invoice_state?: string | null;
          last_synced_at?: string;
          net_invoiced_amount?: number | null;
          opco_settled_amount?: number | null;
          opening_date?: string | null;
          paid_amount?: number | null;
          paid_at?: string | null;
          siret_cfa?: string | null;
          source_client_id?: string | null;
          step_number: number;
          total_amount?: number | null;
        };
        Update: {
          contrat_id?: string;
          created_at?: string;
          eduvia_contract_id?: number;
          eduvia_id?: number;
          eduvia_invoice_id?: number | null;
          external_code?: string | null;
          external_number?: string | null;
          id?: string;
          in_progress_amount?: number | null;
          including_pedagogie_amount?: number | null;
          including_rqth_amount?: number | null;
          invoice_number?: string | null;
          invoice_sent_at?: string | null;
          invoice_state?: string | null;
          last_synced_at?: string;
          net_invoiced_amount?: number | null;
          opco_settled_amount?: number | null;
          opening_date?: string | null;
          paid_amount?: number | null;
          paid_at?: string | null;
          siret_cfa?: string | null;
          source_client_id?: string | null;
          step_number?: number;
          total_amount?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'eduvia_invoice_steps_contrat_id_fkey';
            columns: ['contrat_id'];
            isOneToOne: false;
            referencedRelation: 'contrats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'eduvia_invoice_steps_source_client_id_fkey';
            columns: ['source_client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      eduvia_sync_logs: {
        Row: {
          client_id: string | null;
          created_at: string;
          duration_ms: number | null;
          erreur: string | null;
          id: string;
          stats: Json | null;
          statut: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          erreur?: string | null;
          id?: string;
          stats?: Json | null;
          statut: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          erreur?: string | null;
          id?: string;
          stats?: Json | null;
          statut?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'eduvia_sync_logs_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      email_send_log: {
        Row: {
          id: string;
          job: string;
          metadata: Json | null;
          periode_key: string;
          recipients_count: number | null;
          sent_at: string;
        };
        Insert: {
          id?: string;
          job: string;
          metadata?: Json | null;
          periode_key: string;
          recipients_count?: number | null;
          sent_at?: string;
        };
        Update: {
          id?: string;
          job?: string;
          metadata?: Json | null;
          periode_key?: string;
          recipients_count?: number | null;
          sent_at?: string;
        };
        Relationships: [];
      };
      facturation_ajustements_pending: {
        Row: {
          contrat_id: string | null;
          created_at: string;
          delta_ht: number;
          detail: Json | null;
          id: string;
          motif: string | null;
          projet_id: string | null;
          resolved_action: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          resolved_facture_id: string | null;
          type: string;
        };
        Insert: {
          contrat_id?: string | null;
          created_at?: string;
          delta_ht: number;
          detail?: Json | null;
          id?: string;
          motif?: string | null;
          projet_id?: string | null;
          resolved_action?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          resolved_facture_id?: string | null;
          type: string;
        };
        Update: {
          contrat_id?: string | null;
          created_at?: string;
          delta_ht?: number;
          detail?: Json | null;
          id?: string;
          motif?: string | null;
          projet_id?: string | null;
          resolved_action?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          resolved_facture_id?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'facturation_ajustements_pending_contrat_id_fkey';
            columns: ['contrat_id'];
            isOneToOne: false;
            referencedRelation: 'contrats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'facturation_ajustements_pending_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'facturation_ajustements_pending_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'facturation_ajustements_pending_resolved_facture_id_fkey';
            columns: ['resolved_facture_id'];
            isOneToOne: false;
            referencedRelation: 'factures';
            referencedColumns: ['id'];
          },
        ];
      };
      facture_lignes: {
        Row: {
          analytic_line_odoo_id: string | null;
          contrat_id: string | null;
          created_at: string;
          description: string;
          est_avoir: boolean;
          event_libere_le: string | null;
          event_source_id: string | null;
          event_type: string | null;
          facture_id: string;
          id: string;
          mois_relatif: number | null;
          montant_ht: number;
          npec_snapshot: number | null;
          opco_code: string | null;
          ordre: number | null;
          quote_part: number | null;
          taux_commission_snapshot: number | null;
          taux_tva_ligne: number | null;
        };
        Insert: {
          analytic_line_odoo_id?: string | null;
          contrat_id?: string | null;
          created_at?: string;
          description: string;
          est_avoir?: boolean;
          event_libere_le?: string | null;
          event_source_id?: string | null;
          event_type?: string | null;
          facture_id: string;
          id?: string;
          mois_relatif?: number | null;
          montant_ht: number;
          npec_snapshot?: number | null;
          opco_code?: string | null;
          ordre?: number | null;
          quote_part?: number | null;
          taux_commission_snapshot?: number | null;
          taux_tva_ligne?: number | null;
        };
        Update: {
          analytic_line_odoo_id?: string | null;
          contrat_id?: string | null;
          created_at?: string;
          description?: string;
          est_avoir?: boolean;
          event_libere_le?: string | null;
          event_source_id?: string | null;
          event_type?: string | null;
          facture_id?: string;
          id?: string;
          mois_relatif?: number | null;
          montant_ht?: number;
          npec_snapshot?: number | null;
          opco_code?: string | null;
          ordre?: number | null;
          quote_part?: number | null;
          taux_commission_snapshot?: number | null;
          taux_tva_ligne?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'facture_lignes_contrat_id_fkey';
            columns: ['contrat_id'];
            isOneToOne: false;
            referencedRelation: 'contrats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'facture_lignes_facture_id_fkey';
            columns: ['facture_id'];
            isOneToOne: false;
            referencedRelation: 'factures';
            referencedColumns: ['id'];
          },
        ];
      };
      factures: {
        Row: {
          avoir_motif: string | null;
          client_id: string;
          conditions_reglement: string | null;
          created_at: string;
          created_by: string | null;
          date_echeance: string | null;
          date_emission: string | null;
          devis_id: string | null;
          email_envoye: boolean;
          email_erreur: string | null;
          email_last_attempt_at: string | null;
          est_acompte: boolean;
          est_avoir: boolean;
          facture_origine_id: string | null;
          id: string;
          mois_concerne: string | null;
          montant_ht: number;
          montant_ttc: number;
          montant_tva: number;
          numero_seq: number | null;
          objet: string | null;
          odoo_id: string | null;
          pdf_url: string | null;
          peppol_state: string | null;
          projet_id: string;
          ref: string | null;
          societe_emettrice_id: string;
          statut: Database['public']['Enums']['statut_facture'];
          taux_tva: number;
          updated_at: string;
        };
        Insert: {
          avoir_motif?: string | null;
          client_id: string;
          conditions_reglement?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_echeance?: string | null;
          date_emission?: string | null;
          devis_id?: string | null;
          email_envoye?: boolean;
          email_erreur?: string | null;
          email_last_attempt_at?: string | null;
          est_acompte?: boolean;
          est_avoir?: boolean;
          facture_origine_id?: string | null;
          id?: string;
          mois_concerne?: string | null;
          montant_ht: number;
          montant_ttc: number;
          montant_tva: number;
          numero_seq?: number | null;
          objet?: string | null;
          odoo_id?: string | null;
          pdf_url?: string | null;
          peppol_state?: string | null;
          projet_id: string;
          ref?: string | null;
          societe_emettrice_id: string;
          statut?: Database['public']['Enums']['statut_facture'];
          taux_tva?: number;
          updated_at?: string;
        };
        Update: {
          avoir_motif?: string | null;
          client_id?: string;
          conditions_reglement?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_echeance?: string | null;
          date_emission?: string | null;
          devis_id?: string | null;
          email_envoye?: boolean;
          email_erreur?: string | null;
          email_last_attempt_at?: string | null;
          est_acompte?: boolean;
          est_avoir?: boolean;
          facture_origine_id?: string | null;
          id?: string;
          mois_concerne?: string | null;
          montant_ht?: number;
          montant_ttc?: number;
          montant_tva?: number;
          numero_seq?: number | null;
          objet?: string | null;
          odoo_id?: string | null;
          pdf_url?: string | null;
          peppol_state?: string | null;
          projet_id?: string;
          ref?: string | null;
          societe_emettrice_id?: string;
          statut?: Database['public']['Enums']['statut_facture'];
          taux_tva?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'factures_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'factures_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'factures_devis_id_fkey';
            columns: ['devis_id'];
            isOneToOne: false;
            referencedRelation: 'devis';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'factures_facture_origine_id_fkey';
            columns: ['facture_origine_id'];
            isOneToOne: false;
            referencedRelation: 'factures';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'factures_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'factures_societe_emettrice_id_fkey';
            columns: ['societe_emettrice_id'];
            isOneToOne: false;
            referencedRelation: 'societes_emettrices';
            referencedColumns: ['id'];
          },
        ];
      };
      formations: {
        Row: {
          code_diploma: string | null;
          created_at: string;
          diploma_type: string | null;
          duree: string | null;
          eduvia_id: number;
          id: string;
          last_synced_at: string | null;
          qualification_title: string | null;
          rncp: string | null;
          sequence_count: number | null;
          source_client_id: string | null;
        };
        Insert: {
          code_diploma?: string | null;
          created_at?: string;
          diploma_type?: string | null;
          duree?: string | null;
          eduvia_id: number;
          id?: string;
          last_synced_at?: string | null;
          qualification_title?: string | null;
          rncp?: string | null;
          sequence_count?: number | null;
          source_client_id?: string | null;
        };
        Update: {
          code_diploma?: string | null;
          created_at?: string;
          diploma_type?: string | null;
          duree?: string | null;
          eduvia_id?: number;
          id?: string;
          last_synced_at?: string | null;
          qualification_title?: string | null;
          rncp?: string | null;
          sequence_count?: number | null;
          source_client_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'formations_source_client_id_fkey';
            columns: ['source_client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      idees: {
        Row: {
          archive: boolean;
          auteur_id: string;
          cible: Database['public']['Enums']['cible_idee'];
          created_at: string;
          description: string | null;
          id: string;
          implementee_at: string | null;
          implementee_par: string | null;
          rejet_motif: string | null;
          statut: Database['public']['Enums']['statut_idee'];
          titre: string;
          updated_at: string;
          validee_at: string | null;
          validee_par: string | null;
        };
        Insert: {
          archive?: boolean;
          auteur_id: string;
          cible?: Database['public']['Enums']['cible_idee'];
          created_at?: string;
          description?: string | null;
          id?: string;
          implementee_at?: string | null;
          implementee_par?: string | null;
          rejet_motif?: string | null;
          statut?: Database['public']['Enums']['statut_idee'];
          titre: string;
          updated_at?: string;
          validee_at?: string | null;
          validee_par?: string | null;
        };
        Update: {
          archive?: boolean;
          auteur_id?: string;
          cible?: Database['public']['Enums']['cible_idee'];
          created_at?: string;
          description?: string | null;
          id?: string;
          implementee_at?: string | null;
          implementee_par?: string | null;
          rejet_motif?: string | null;
          statut?: Database['public']['Enums']['statut_idee'];
          titre?: string;
          updated_at?: string;
          validee_at?: string | null;
          validee_par?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'idees_auteur_id_fkey';
            columns: ['auteur_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'idees_implementee_par_fkey';
            columns: ['implementee_par'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'idees_validee_par_fkey';
            columns: ['validee_par'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      jours_feries: {
        Row: {
          annee: number;
          created_at: string;
          date: string;
          id: string;
          libelle: string;
        };
        Insert: {
          annee: number;
          created_at?: string;
          date: string;
          id?: string;
          libelle: string;
        };
        Update: {
          annee?: number;
          created_at?: string;
          date?: string;
          id?: string;
          libelle?: string;
        };
        Relationships: [];
      };
      kpi_snapshots: {
        Row: {
          created_at: string;
          id: string;
          mois: string;
          scope: Database['public']['Enums']['scope_kpi'];
          scope_id: string | null;
          type_kpi: string;
          valeur: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mois: string;
          scope?: Database['public']['Enums']['scope_kpi'];
          scope_id?: string | null;
          type_kpi: string;
          valeur: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          mois?: string;
          scope?: Database['public']['Enums']['scope_kpi'];
          scope_id?: string | null;
          type_kpi?: string;
          valeur?: number;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          lien: string | null;
          message: string | null;
          read_at: string | null;
          subject_user_id: string | null;
          titre: string;
          type: Database['public']['Enums']['type_notification'];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          lien?: string | null;
          message?: string | null;
          read_at?: string | null;
          subject_user_id?: string | null;
          titre: string;
          type: Database['public']['Enums']['type_notification'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          lien?: string | null;
          message?: string | null;
          read_at?: string | null;
          subject_user_id?: string | null;
          titre?: string;
          type?: Database['public']['Enums']['type_notification'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_subject_user_id_fkey';
            columns: ['subject_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      odoo_sync_logs: {
        Row: {
          created_at: string | null;
          direction: string;
          entity_id: string | null;
          entity_type: string;
          erreur: string | null;
          id: string;
          payload: Json | null;
          statut: string;
        };
        Insert: {
          created_at?: string | null;
          direction: string;
          entity_id?: string | null;
          entity_type: string;
          erreur?: string | null;
          id?: string;
          payload?: Json | null;
          statut: string;
        };
        Update: {
          created_at?: string | null;
          direction?: string;
          entity_id?: string | null;
          entity_type?: string;
          erreur?: string | null;
          id?: string;
          payload?: Json | null;
          statut?: string;
        };
        Relationships: [];
      };
      opcos: {
        Row: {
          actif: boolean;
          code: string;
          created_at: string;
          id: string;
          idcc_codes: string[];
          nom: string;
          updated_at: string;
        };
        Insert: {
          actif?: boolean;
          code: string;
          created_at?: string;
          id?: string;
          idcc_codes?: string[];
          nom: string;
          updated_at?: string;
        };
        Update: {
          actif?: boolean;
          code?: string;
          created_at?: string;
          id?: string;
          idcc_codes?: string[];
          nom?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      paiements: {
        Row: {
          created_at: string;
          date_reception: string;
          facture_id: string;
          id: string;
          montant: number;
          odoo_id: string | null;
          saisie_manuelle: boolean;
        };
        Insert: {
          created_at?: string;
          date_reception: string;
          facture_id: string;
          id?: string;
          montant: number;
          odoo_id?: string | null;
          saisie_manuelle?: boolean;
        };
        Update: {
          created_at?: string;
          date_reception?: string;
          facture_id?: string;
          id?: string;
          montant?: number;
          odoo_id?: string | null;
          saisie_manuelle?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'paiements_facture_id_fkey';
            columns: ['facture_id'];
            isOneToOne: false;
            referencedRelation: 'factures';
            referencedColumns: ['id'];
          },
        ];
      };
      parametres: {
        Row: {
          categorie: string;
          cle: string;
          description: string | null;
          id: string;
          updated_at: string;
          updated_by: string | null;
          valeur: string;
        };
        Insert: {
          categorie: string;
          cle: string;
          description?: string | null;
          id?: string;
          updated_at?: string;
          updated_by?: string | null;
          valeur: string;
        };
        Update: {
          categorie?: string;
          cle?: string;
          description?: string | null;
          id?: string;
          updated_at?: string;
          updated_by?: string | null;
          valeur?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'parametres_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      process_index: {
        Row: {
          content_hash: string;
          contenu: string;
          detail: Json | null;
          detail_hash: string | null;
          embedding: number[];
          fiche_code: string;
          id: string;
          mission_code: string;
          mission_nom: string;
          source_fiche_id: string;
          titre: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          content_hash: string;
          contenu: string;
          detail?: Json | null;
          detail_hash?: string | null;
          embedding: number[];
          fiche_code: string;
          id?: string;
          mission_code: string;
          mission_nom: string;
          source_fiche_id: string;
          titre: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          content_hash?: string;
          contenu?: string;
          detail?: Json | null;
          detail_hash?: string | null;
          embedding?: number[];
          fiche_code?: string;
          id?: string;
          mission_code?: string;
          mission_nom?: string;
          source_fiche_id?: string;
          titre?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      process_qa_feedback: {
        Row: {
          answer: string;
          created_at: string;
          id: string;
          question: string;
          rating: number;
          sources: Json | null;
          user_id: string;
        };
        Insert: {
          answer: string;
          created_at?: string;
          id?: string;
          question: string;
          rating: number;
          sources?: Json | null;
          user_id: string;
        };
        Update: {
          answer?: string;
          created_at?: string;
          id?: string;
          question?: string;
          rating?: number;
          sources?: Json | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'process_qa_feedback_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      progression_snapshots_weekly: {
        Row: {
          captured_at: string;
          completed_sequences: number | null;
          contrat_id: string;
          id: string;
          progression_percentage: number;
          semaine_debut: string;
          total_spent_time_hours: number | null;
        };
        Insert: {
          captured_at?: string;
          completed_sequences?: number | null;
          contrat_id: string;
          id?: string;
          progression_percentage: number;
          semaine_debut: string;
          total_spent_time_hours?: number | null;
        };
        Update: {
          captured_at?: string;
          completed_sequences?: number | null;
          contrat_id?: string;
          id?: string;
          progression_percentage?: number;
          semaine_debut?: string;
          total_spent_time_hours?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'progression_snapshots_weekly_contrat_id_fkey';
            columns: ['contrat_id'];
            isOneToOne: false;
            referencedRelation: 'contrats';
            referencedColumns: ['id'];
          },
        ];
      };
      projet_documents: {
        Row: {
          created_at: string;
          id: string;
          nom_fichier: string;
          projet_id: string;
          storage_path: string;
          type_document: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          nom_fichier: string;
          projet_id: string;
          storage_path: string;
          type_document?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          nom_fichier?: string;
          projet_id?: string;
          storage_path?: string;
          type_document?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projet_documents_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projet_documents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      projet_lancement_commentaires: {
        Row: {
          contenu: string;
          created_at: string;
          etape_key: string;
          id: string;
          projet_id: string;
          user_id: string;
        };
        Insert: {
          contenu: string;
          created_at?: string;
          etape_key: string;
          id?: string;
          projet_id: string;
          user_id: string;
        };
        Update: {
          contenu?: string;
          created_at?: string;
          etape_key?: string;
          id?: string;
          projet_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projet_lancement_commentaires_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projet_lancement_commentaires_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      projet_lancement_documents: {
        Row: {
          created_at: string;
          etape_key: string;
          id: string;
          nom_fichier: string;
          projet_id: string;
          storage_path: string;
          type_document: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          etape_key: string;
          id?: string;
          nom_fichier: string;
          projet_id: string;
          storage_path: string;
          type_document?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          etape_key?: string;
          id?: string;
          nom_fichier?: string;
          projet_id?: string;
          storage_path?: string;
          type_document?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projet_lancement_documents_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projet_lancement_documents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      projet_lancement_etapes: {
        Row: {
          created_at: string;
          etape_key: string;
          id: string;
          projet_id: string;
          statut: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          etape_key: string;
          id?: string;
          projet_id: string;
          statut?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          etape_key?: string;
          id?: string;
          projet_id?: string;
          statut?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'projet_lancement_etapes_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projet_lancement_etapes_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      projets: {
        Row: {
          archive: boolean;
          backup_cdp_id: string | null;
          categorie_interne_id: string | null;
          cdp_id: string | null;
          client_id: string;
          code_analytique: string | null;
          created_at: string;
          date_debut: string | null;
          echeancier_override: Json | null;
          echeancier_template_id: string | null;
          eduvia_company_ids: number[] | null;
          est_absence: boolean;
          est_interne: boolean;
          est_libre: boolean;
          id: string;
          modele_facturation: string;
          ref: string | null;
          statut: Database['public']['Enums']['statut_projet'];
          taux_commission: number;
          typologie_id: string;
          updated_at: string;
        };
        Insert: {
          archive?: boolean;
          backup_cdp_id?: string | null;
          categorie_interne_id?: string | null;
          cdp_id?: string | null;
          client_id: string;
          code_analytique?: string | null;
          created_at?: string;
          date_debut?: string | null;
          echeancier_override?: Json | null;
          echeancier_template_id?: string | null;
          eduvia_company_ids?: number[] | null;
          est_absence?: boolean;
          est_interne?: boolean;
          est_libre?: boolean;
          id?: string;
          modele_facturation?: string;
          ref?: string | null;
          statut?: Database['public']['Enums']['statut_projet'];
          taux_commission?: number;
          typologie_id: string;
          updated_at?: string;
        };
        Update: {
          archive?: boolean;
          backup_cdp_id?: string | null;
          categorie_interne_id?: string | null;
          cdp_id?: string | null;
          client_id?: string;
          code_analytique?: string | null;
          created_at?: string;
          date_debut?: string | null;
          echeancier_override?: Json | null;
          echeancier_template_id?: string | null;
          eduvia_company_ids?: number[] | null;
          est_absence?: boolean;
          est_interne?: boolean;
          est_libre?: boolean;
          id?: string;
          modele_facturation?: string;
          ref?: string | null;
          statut?: Database['public']['Enums']['statut_projet'];
          taux_commission?: number;
          typologie_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projets_backup_cdp_id_fkey';
            columns: ['backup_cdp_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projets_categorie_interne_id_fkey';
            columns: ['categorie_interne_id'];
            isOneToOne: false;
            referencedRelation: 'categories_internes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projets_cdp_id_fkey';
            columns: ['cdp_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projets_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projets_echeancier_template_id_fkey';
            columns: ['echeancier_template_id'];
            isOneToOne: false;
            referencedRelation: 'echeanciers_templates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projets_typologie_id_fkey';
            columns: ['typologie_id'];
            isOneToOne: false;
            referencedRelation: 'typologies_projet';
            referencedColumns: ['id'];
          },
        ];
      };
      qualite_assignments: {
        Row: {
          campus_id: number;
          client_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          indicator_id: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          campus_id: number;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          indicator_id: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          campus_id?: number;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          indicator_id?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'qualite_assignments_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'qualite_assignments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'qualite_assignments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      rdv_formateurs: {
        Row: {
          cdp_id: string | null;
          created_at: string;
          date_prevue: string;
          date_realisee: string | null;
          formateur_id: string | null;
          formateur_nom: string | null;
          id: string;
          notes: string | null;
          objet: string | null;
          projet_id: string;
          statut: Database['public']['Enums']['statut_rdv'];
          updated_at: string;
        };
        Insert: {
          cdp_id?: string | null;
          created_at?: string;
          date_prevue: string;
          date_realisee?: string | null;
          formateur_id?: string | null;
          formateur_nom?: string | null;
          id?: string;
          notes?: string | null;
          objet?: string | null;
          projet_id: string;
          statut?: Database['public']['Enums']['statut_rdv'];
          updated_at?: string;
        };
        Update: {
          cdp_id?: string | null;
          created_at?: string;
          date_prevue?: string;
          date_realisee?: string | null;
          formateur_id?: string | null;
          formateur_nom?: string | null;
          id?: string;
          notes?: string | null;
          objet?: string | null;
          projet_id?: string;
          statut?: Database['public']['Enums']['statut_rdv'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rdv_formateurs_cdp_id_fkey';
            columns: ['cdp_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rdv_formateurs_formateur_id_fkey';
            columns: ['formateur_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rdv_formateurs_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
        ];
      };
      saisies_temps: {
        Row: {
          created_at: string;
          date: string;
          heures: number;
          id: string;
          projet_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          heures: number;
          id?: string;
          projet_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          heures?: number;
          id?: string;
          projet_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'saisies_temps_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'saisies_temps_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      saisies_temps_axes: {
        Row: {
          axe: string;
          heures: number;
          id: string;
          saisie_id: string;
        };
        Insert: {
          axe: string;
          heures: number;
          id?: string;
          saisie_id: string;
        };
        Update: {
          axe?: string;
          heures?: number;
          id?: string;
          saisie_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'saisies_temps_axes_saisie_id_fkey';
            columns: ['saisie_id'];
            isOneToOne: false;
            referencedRelation: 'saisies_temps';
            referencedColumns: ['id'];
          },
        ];
      };
      signature_requests: {
        Row: {
          client_id: string | null;
          created_at: string;
          document_path: string | null;
          id: string;
          initiated_by: string | null;
          prospect_id: string | null;
          provider: string;
          provider_request_id: string | null;
          sent_at: string | null;
          signed_at: string | null;
          signed_document_path: string | null;
          statut: Database['public']['Enums']['statut_signature'];
          titre: string;
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          document_path?: string | null;
          id?: string;
          initiated_by?: string | null;
          prospect_id?: string | null;
          provider?: string;
          provider_request_id?: string | null;
          sent_at?: string | null;
          signed_at?: string | null;
          signed_document_path?: string | null;
          statut?: Database['public']['Enums']['statut_signature'];
          titre: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          document_path?: string | null;
          id?: string;
          initiated_by?: string | null;
          prospect_id?: string | null;
          provider?: string;
          provider_request_id?: string | null;
          sent_at?: string | null;
          signed_at?: string | null;
          signed_document_path?: string | null;
          statut?: Database['public']['Enums']['statut_signature'];
          titre?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'signature_requests_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signature_requests_initiated_by_fkey';
            columns: ['initiated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      societes_emettrices: {
        Row: {
          actif: boolean;
          adresse: string;
          banque_bic: string | null;
          banque_iban: string | null;
          banque_nom: string | null;
          capital_social: number | null;
          code: string;
          code_postal: string;
          conditions_reglement_default: string | null;
          created_at: string;
          email_contact: string;
          est_defaut: boolean;
          forme_juridique: string | null;
          id: string;
          legacy_ref_format: boolean;
          logo_url: string | null;
          mentions_legales: string | null;
          odoo_company_id: number | null;
          odoo_journal_id: number | null;
          pays: string;
          raison_sociale: string;
          siret: string;
          telephone: string | null;
          tva_intracom: string;
          tva_sur_debits: boolean;
          updated_at: string;
          validite_devis_jours: number;
          ville: string;
        };
        Insert: {
          actif?: boolean;
          adresse: string;
          banque_bic?: string | null;
          banque_iban?: string | null;
          banque_nom?: string | null;
          capital_social?: number | null;
          code: string;
          code_postal: string;
          conditions_reglement_default?: string | null;
          created_at?: string;
          email_contact: string;
          est_defaut?: boolean;
          forme_juridique?: string | null;
          id?: string;
          legacy_ref_format?: boolean;
          logo_url?: string | null;
          mentions_legales?: string | null;
          odoo_company_id?: number | null;
          odoo_journal_id?: number | null;
          pays?: string;
          raison_sociale: string;
          siret: string;
          telephone?: string | null;
          tva_intracom: string;
          tva_sur_debits?: boolean;
          updated_at?: string;
          validite_devis_jours?: number;
          ville: string;
        };
        Update: {
          actif?: boolean;
          adresse?: string;
          banque_bic?: string | null;
          banque_iban?: string | null;
          banque_nom?: string | null;
          capital_social?: number | null;
          code?: string;
          code_postal?: string;
          conditions_reglement_default?: string | null;
          created_at?: string;
          email_contact?: string;
          est_defaut?: boolean;
          forme_juridique?: string | null;
          id?: string;
          legacy_ref_format?: boolean;
          logo_url?: string | null;
          mentions_legales?: string | null;
          odoo_company_id?: number | null;
          odoo_journal_id?: number | null;
          pays?: string;
          raison_sociale?: string;
          siret?: string;
          telephone?: string | null;
          tva_intracom?: string;
          tva_sur_debits?: boolean;
          updated_at?: string;
          validite_devis_jours?: number;
          ville?: string;
        };
        Relationships: [];
      };
      team_messages: {
        Row: {
          contenu: string | null;
          created_at: string;
          gif_url: string | null;
          id: string;
          user_id: string;
        };
        Insert: {
          contenu?: string | null;
          created_at?: string;
          gif_url?: string | null;
          id?: string;
          user_id: string;
        };
        Update: {
          contenu?: string | null;
          created_at?: string;
          gif_url?: string | null;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'team_messages_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      typologies_projet: {
        Row: {
          actif: boolean;
          code: string;
          created_at: string;
          id: string;
          libelle: string;
        };
        Insert: {
          actif?: boolean;
          code: string;
          created_at?: string;
          id?: string;
          libelle: string;
        };
        Update: {
          actif?: boolean;
          code?: string;
          created_at?: string;
          id?: string;
          libelle?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          actif: boolean;
          avantages_annuels: number | null;
          avatar_mode: string;
          avatar_regen_date: string | null;
          avatar_seed: string | null;
          can_ship_ideas: boolean;
          can_validate_ideas: boolean;
          cdp_disponibilite: Database['public']['Enums']['dispo_cdp'] | null;
          cdp_seuil_alerte: number;
          created_at: string;
          derniere_connexion: string | null;
          email: string;
          heures_hebdo: number | null;
          id: string;
          jours_conges_payes: number | null;
          jours_rtt: number | null;
          nom: string;
          onboarding_completed_at: string | null;
          pipeline_access: boolean;
          prenom: string;
          primes_annuelles: number | null;
          referent_cdp: boolean;
          role: Database['public']['Enums']['role_utilisateur'];
          salaire_brut_annuel: number | null;
          taux_charges_patronales: number | null;
          telephone: string | null;
          updated_at: string;
          welcome_email_sent_at: string | null;
        };
        Insert: {
          actif?: boolean;
          avantages_annuels?: number | null;
          avatar_mode?: string;
          avatar_regen_date?: string | null;
          avatar_seed?: string | null;
          can_ship_ideas?: boolean;
          can_validate_ideas?: boolean;
          cdp_disponibilite?: Database['public']['Enums']['dispo_cdp'] | null;
          cdp_seuil_alerte?: number;
          created_at?: string;
          derniere_connexion?: string | null;
          email: string;
          heures_hebdo?: number | null;
          id: string;
          jours_conges_payes?: number | null;
          jours_rtt?: number | null;
          nom: string;
          onboarding_completed_at?: string | null;
          pipeline_access?: boolean;
          prenom: string;
          primes_annuelles?: number | null;
          referent_cdp?: boolean;
          role?: Database['public']['Enums']['role_utilisateur'];
          salaire_brut_annuel?: number | null;
          taux_charges_patronales?: number | null;
          telephone?: string | null;
          updated_at?: string;
          welcome_email_sent_at?: string | null;
        };
        Update: {
          actif?: boolean;
          avantages_annuels?: number | null;
          avatar_mode?: string;
          avatar_regen_date?: string | null;
          avatar_seed?: string | null;
          can_ship_ideas?: boolean;
          can_validate_ideas?: boolean;
          cdp_disponibilite?: Database['public']['Enums']['dispo_cdp'] | null;
          cdp_seuil_alerte?: number;
          created_at?: string;
          derniere_connexion?: string | null;
          email?: string;
          heures_hebdo?: number | null;
          id?: string;
          jours_conges_payes?: number | null;
          jours_rtt?: number | null;
          nom?: string;
          onboarding_completed_at?: string | null;
          pipeline_access?: boolean;
          prenom?: string;
          primes_annuelles?: number | null;
          referent_cdp?: boolean;
          role?: Database['public']['Enums']['role_utilisateur'];
          salaire_brut_annuel?: number | null;
          taux_charges_patronales?: number | null;
          telephone?: string | null;
          updated_at?: string;
          welcome_email_sent_at?: string | null;
        };
        Relationships: [];
      };
      webauthn_credentials: {
        Row: {
          backed_up: boolean;
          counter: number;
          created_at: string;
          credential_id: string;
          device_name: string | null;
          device_type: string | null;
          id: string;
          last_used_at: string | null;
          public_key: string;
          transports: string[] | null;
          user_id: string;
        };
        Insert: {
          backed_up?: boolean;
          counter?: number;
          created_at?: string;
          credential_id: string;
          device_name?: string | null;
          device_type?: string | null;
          id?: string;
          last_used_at?: string | null;
          public_key: string;
          transports?: string[] | null;
          user_id: string;
        };
        Update: {
          backed_up?: boolean;
          counter?: number;
          created_at?: string;
          credential_id?: string;
          device_name?: string | null;
          device_type?: string | null;
          id?: string;
          last_used_at?: string | null;
          public_key?: string;
          transports?: string[] | null;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_devis_public: {
        Args: {
          p_email: string;
          p_ip?: unknown;
          p_nom: string;
          p_token: string;
          p_user_agent?: string;
        };
        Returns: Json;
      };
      contrats_actifs_fenetre: {
        Args: { p_first: string; p_next: string };
        Returns: {
          date_debut: string;
          duree_mois: number;
          npec_amount: number;
          taux_commission: number;
          date_rupture: string | null;
        }[];
      };
      count_factures_by_statut: {
        Args: never;
        Returns: {
          n: number;
          statut: Database['public']['Enums']['statut_facture'];
        }[];
      };
      delete_user_cascade: { Args: { p_user_id: string }; Returns: undefined };
      get_devis_pdf_public: { Args: { p_token: string }; Returns: Json };
      get_devis_public: {
        Args: { p_ip?: unknown; p_token: string; p_user_agent?: string };
        Returns: Json;
      };
      get_or_create_projet_libre: {
        Args: { p_client_id: string };
        Returns: string;
      };
      get_user_role: { Args: never; Returns: string };
      has_pipeline_access: { Args: never; Returns: boolean };
      has_ship_ideas_access: { Args: never; Returns: boolean };
      has_validate_ideas_access: { Args: never; Returns: boolean };
      is_admin: { Args: never; Returns: boolean };
      is_cdp_affecte_de: { Args: { cid: string }; Returns: boolean };
      is_commercial: { Args: never; Returns: boolean };
      is_referent_cdp: { Args: never; Returns: boolean };
      list_auth_orphans: {
        Args: { p_older_than_hours?: number };
        Returns: {
          created_at: string;
          email: string;
          id: string;
        }[];
      };
      opcos_check_idcc: { Args: { idccs: string[] }; Returns: boolean };
      production_month_sums: {
        Args: { p_first: string; p_next: string };
        Returns: {
          en_retard: number;
          en_retard_ttc: number;
          encaisse: number;
          encaisse_ttc: number;
          facture: number;
          facture_ttc: number;
          mois: string;
        }[];
      };
      refuse_devis_public: {
        Args: { p_motif: string; p_token: string };
        Returns: Json;
      };
      search_brain_trgm: {
        Args: { k?: number; q: string };
        Returns: {
          aliases: string[];
          body: string;
          frontmatter: Json;
          id: string;
          links: string[];
          path: string;
          source_hash: string | null;
          source_ref: string | null;
          tags: string[];
          title: string;
          type: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'brain_notes';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      search_process_trgm: {
        Args: { q: string };
        Returns: {
          content_hash: string;
          contenu: string;
          detail: Json | null;
          detail_hash: string | null;
          embedding: number[];
          fiche_code: string;
          id: string;
          mission_code: string;
          mission_nom: string;
          source_fiche_id: string;
          titre: string;
          updated_at: string;
          url: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'process_index';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
    };
    Enums: {
      absence_type: 'conges' | 'maladie';
      cible_idee: 'eduvia' | 'soluvia' | 'workflow' | 'autre';
      dispo_cdp: 'disponible' | 'tendu' | 'sature';
      niveau_charge: 'faible' | 'moyenne' | 'forte';
      niveau_risque: 'faible' | 'moyen' | 'fort';
      role_utilisateur: 'admin' | 'cdp' | 'superadmin' | 'commercial';
      scope_kpi: 'global' | 'projet' | 'cdp';
      statut_devis:
        | 'brouillon'
        | 'envoye'
        | 'accepte'
        | 'refuse'
        | 'expire'
        | 'remplace'
        | 'annule';
      statut_facture: 'a_emettre' | 'emise' | 'payee' | 'en_retard' | 'avoir';
      statut_idee: 'proposee' | 'validee' | 'implementee' | 'rejetee';
      statut_projet: 'actif' | 'en_pause' | 'termine' | 'archive';
      statut_rdv: 'prevu' | 'realise' | 'annule' | 'reporte';
      statut_signature:
        | 'brouillon'
        | 'envoyee'
        | 'signee'
        | 'refusee'
        | 'expiree'
        | 'annulee';
      statut_synthese:
        | 'generee'
        | 'diffusee_vague1'
        | 'diffusee_vague2'
        | 'archivee'
        | 'en_cours_completion'
        | 'en_attente_arbitrage'
        | 'cdp_affecte';
      type_notification:
        | 'facture_retard'
        | 'tache_retard'
        | 'rappel_temps'
        | 'periode_facturation'
        | 'erreur_sync'
        | 'idee_validee'
        | 'idee_rejetee'
        | 'idee_implementee'
        | 'collaborateur_a_affecter'
        | 'prospect_rdv_a_venir'
        | 'prospect_rdv_sans_mail'
        | 'prospect_sans_activite'
        | 'modele_publie'
        | 'contrat_a_signer'
        | 'contrat_signe'
        | 'cdp_a_affecter'
        | 'cdp_affecte'
        | 'cdp_saturation'
        | 'passation_diffusee'
        | 'linkedin_prospect_cree'
        | 'linkedin_erreur'
        | 'passation_a_completer'
        | 'passation_rappel'
        | 'taux_derogatoire'
        | 'contrat_facturable';
      typologie_client:
        | 'exigeant'
        | 'collaboratif'
        | 'autonome'
        | 'accompagnement_fort';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  crm: {
    Enums: {},
  },
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      absence_type: ['conges', 'maladie'],
      cible_idee: ['eduvia', 'soluvia', 'workflow', 'autre'],
      dispo_cdp: ['disponible', 'tendu', 'sature'],
      niveau_charge: ['faible', 'moyenne', 'forte'],
      niveau_risque: ['faible', 'moyen', 'fort'],
      role_utilisateur: ['admin', 'cdp', 'superadmin', 'commercial'],
      scope_kpi: ['global', 'projet', 'cdp'],
      statut_devis: [
        'brouillon',
        'envoye',
        'accepte',
        'refuse',
        'expire',
        'remplace',
        'annule',
      ],
      statut_facture: ['a_emettre', 'emise', 'payee', 'en_retard', 'avoir'],
      statut_idee: ['proposee', 'validee', 'implementee', 'rejetee'],
      statut_projet: ['actif', 'en_pause', 'termine', 'archive'],
      statut_rdv: ['prevu', 'realise', 'annule', 'reporte'],
      statut_signature: [
        'brouillon',
        'envoyee',
        'signee',
        'refusee',
        'expiree',
        'annulee',
      ],
      statut_synthese: [
        'generee',
        'diffusee_vague1',
        'diffusee_vague2',
        'archivee',
        'en_cours_completion',
        'en_attente_arbitrage',
        'cdp_affecte',
      ],
      type_notification: [
        'facture_retard',
        'tache_retard',
        'rappel_temps',
        'periode_facturation',
        'erreur_sync',
        'idee_validee',
        'idee_rejetee',
        'idee_implementee',
        'collaborateur_a_affecter',
        'prospect_rdv_a_venir',
        'prospect_rdv_sans_mail',
        'prospect_sans_activite',
        'modele_publie',
        'contrat_a_signer',
        'contrat_signe',
        'cdp_a_affecter',
        'cdp_affecte',
        'cdp_saturation',
        'passation_diffusee',
        'linkedin_prospect_cree',
        'linkedin_erreur',
        'passation_a_completer',
        'passation_rappel',
        'taux_derogatoire',
        'contrat_facturable',
      ],
      typologie_client: [
        'exigeant',
        'collaboratif',
        'autonome',
        'accompagnement_fort',
      ],
    },
  },
} as const;

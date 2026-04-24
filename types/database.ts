export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      apprenants: {
        Row: {
          contrat_id: string | null;
          created_at: string;
          eduvia_formation_id: number | null;
          eduvia_id: number;
          email: string | null;
          gender: string | null;
          id: string;
          internal_number: string | null;
          last_synced_at: string | null;
          learning_end_date: string | null;
          learning_start_date: string | null;
          nom: string | null;
          phone_number: string | null;
          prenom: string | null;
        };
        Insert: {
          contrat_id?: string | null;
          created_at?: string;
          eduvia_formation_id?: number | null;
          eduvia_id: number;
          email?: string | null;
          gender?: string | null;
          id?: string;
          internal_number?: string | null;
          last_synced_at?: string | null;
          learning_end_date?: string | null;
          learning_start_date?: string | null;
          nom?: string | null;
          phone_number?: string | null;
          prenom?: string | null;
        };
        Update: {
          contrat_id?: string | null;
          created_at?: string;
          eduvia_formation_id?: number | null;
          eduvia_id?: number;
          email?: string | null;
          gender?: string | null;
          id?: string;
          internal_number?: string | null;
          last_synced_at?: string | null;
          learning_end_date?: string | null;
          learning_start_date?: string | null;
          nom?: string | null;
          phone_number?: string | null;
          prenom?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'apprenants_contrat_id_fkey';
            columns: ['contrat_id'];
            isOneToOne: false;
            referencedRelation: 'contrats';
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
          telephone: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          nom: string;
          poste?: string | null;
          telephone?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          nom?: string;
          poste?: string | null;
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
          created_at: string;
          date_entree: string | null;
          id: string;
          localisation: string | null;
          numero_nda: string | null;
          numero_qualiopi: string | null;
          numero_uai: string | null;
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
          created_at?: string;
          date_entree?: string | null;
          id?: string;
          localisation?: string | null;
          numero_nda?: string | null;
          numero_qualiopi?: string | null;
          numero_uai?: string | null;
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
          created_at?: string;
          date_entree?: string | null;
          id?: string;
          localisation?: string | null;
          numero_nda?: string | null;
          numero_qualiopi?: string | null;
          numero_uai?: string | null;
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
          duree_mois: number | null;
          eduvia_campus_id: number | null;
          eduvia_company_id: number | null;
          eduvia_employee_id: number | null;
          eduvia_formation_id: number | null;
          eduvia_id: number;
          eduvia_teacher_id: number | null;
          formation_titre: string | null;
          id: string;
          internal_number: string | null;
          last_synced_at: string | null;
          montant_prise_en_charge: number | null;
          npec_amount: number | null;
          practical_training_start_date: string | null;
          projet_id: string;
          ref: string | null;
          referrer_amount: number | null;
          referrer_name: string | null;
          referrer_type: string | null;
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
          duree_mois?: number | null;
          eduvia_campus_id?: number | null;
          eduvia_company_id?: number | null;
          eduvia_employee_id?: number | null;
          eduvia_formation_id?: number | null;
          eduvia_id: number;
          eduvia_teacher_id?: number | null;
          formation_titre?: string | null;
          id?: string;
          internal_number?: string | null;
          last_synced_at?: string | null;
          montant_prise_en_charge?: number | null;
          npec_amount?: number | null;
          practical_training_start_date?: string | null;
          projet_id: string;
          ref?: string | null;
          referrer_amount?: number | null;
          referrer_name?: string | null;
          referrer_type?: string | null;
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
          duree_mois?: number | null;
          eduvia_campus_id?: number | null;
          eduvia_company_id?: number | null;
          eduvia_employee_id?: number | null;
          eduvia_formation_id?: number | null;
          eduvia_id?: number;
          eduvia_teacher_id?: number | null;
          formation_titre?: string | null;
          id?: string;
          internal_number?: string | null;
          last_synced_at?: string | null;
          montant_prise_en_charge?: number | null;
          npec_amount?: number | null;
          practical_training_start_date?: string | null;
          projet_id?: string;
          ref?: string | null;
          referrer_amount?: number | null;
          referrer_name?: string | null;
          referrer_type?: string | null;
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
          montant_prevu_ht: number;
          projet_id: string;
          updated_at: string;
          validee: boolean;
        };
        Insert: {
          created_at?: string;
          date_emission_prevue: string;
          facture_id?: string | null;
          id?: string;
          mois_concerne: string;
          montant_prevu_ht: number;
          projet_id: string;
          updated_at?: string;
          validee?: boolean;
        };
        Update: {
          created_at?: string;
          date_emission_prevue?: string;
          facture_id?: string | null;
          id?: string;
          mois_concerne?: string;
          montant_prevu_ht?: number;
          projet_id?: string;
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
          name: string | null;
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
          name?: string | null;
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
          name?: string | null;
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
          id: string;
          in_progress_amount: number | null;
          including_pedagogie_amount: number | null;
          including_rqth_amount: number | null;
          invoice_sent_at: string | null;
          invoice_state: string | null;
          last_synced_at: string;
          opening_date: string | null;
          paid_amount: number | null;
          paid_at: string | null;
          siret_cfa: string | null;
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
          id?: string;
          in_progress_amount?: number | null;
          including_pedagogie_amount?: number | null;
          including_rqth_amount?: number | null;
          invoice_sent_at?: string | null;
          invoice_state?: string | null;
          last_synced_at?: string;
          opening_date?: string | null;
          paid_amount?: number | null;
          paid_at?: string | null;
          siret_cfa?: string | null;
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
          id?: string;
          in_progress_amount?: number | null;
          including_pedagogie_amount?: number | null;
          including_rqth_amount?: number | null;
          invoice_sent_at?: string | null;
          invoice_state?: string | null;
          last_synced_at?: string;
          opening_date?: string | null;
          paid_amount?: number | null;
          paid_at?: string | null;
          siret_cfa?: string | null;
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
      facture_lignes: {
        Row: {
          contrat_id: string;
          created_at: string;
          description: string;
          facture_id: string;
          id: string;
          montant_ht: number;
        };
        Insert: {
          contrat_id: string;
          created_at?: string;
          description: string;
          facture_id: string;
          id?: string;
          montant_ht: number;
        };
        Update: {
          contrat_id?: string;
          created_at?: string;
          description?: string;
          facture_id?: string;
          id?: string;
          montant_ht?: number;
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
          created_at: string;
          created_by: string | null;
          date_echeance: string | null;
          date_emission: string | null;
          email_envoye: boolean;
          est_avoir: boolean;
          facture_origine_id: string | null;
          id: string;
          mois_concerne: string | null;
          montant_ht: number;
          montant_ttc: number;
          montant_tva: number;
          numero_seq: number | null;
          odoo_id: string | null;
          pdf_url: string | null;
          projet_id: string;
          ref: string | null;
          statut: Database['public']['Enums']['statut_facture'];
          taux_tva: number;
          updated_at: string;
        };
        Insert: {
          avoir_motif?: string | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          date_echeance?: string | null;
          date_emission?: string | null;
          email_envoye?: boolean;
          est_avoir?: boolean;
          facture_origine_id?: string | null;
          id?: string;
          mois_concerne?: string | null;
          montant_ht: number;
          montant_ttc: number;
          montant_tva: number;
          numero_seq?: number | null;
          odoo_id?: string | null;
          pdf_url?: string | null;
          projet_id: string;
          ref?: string | null;
          statut?: Database['public']['Enums']['statut_facture'];
          taux_tva?: number;
          updated_at?: string;
        };
        Update: {
          avoir_motif?: string | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          date_echeance?: string | null;
          date_emission?: string | null;
          email_envoye?: boolean;
          est_avoir?: boolean;
          facture_origine_id?: string | null;
          id?: string;
          mois_concerne?: string | null;
          montant_ht?: number;
          montant_ttc?: number;
          montant_tva?: number;
          numero_seq?: number | null;
          odoo_id?: string | null;
          pdf_url?: string | null;
          projet_id?: string;
          ref?: string | null;
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
          titre: string | null;
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
          titre?: string | null;
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
          titre?: string | null;
        };
        Relationships: [];
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
          titre?: string;
          type?: Database['public']['Enums']['type_notification'];
          user_id?: string;
        };
        Relationships: [
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
      production_mensuelle: {
        Row: {
          created_at: string;
          en_retard: number;
          encaisse_opco: number;
          encaisse_soluvia: number;
          facture_opco: number;
          facture_soluvia: number;
          id: string;
          last_synced_at: string | null;
          mois: string;
          production_opco: number;
          production_soluvia: number;
          projet_id: string;
          reste_a_encaisser: number;
          reste_a_facturer: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          en_retard?: number;
          encaisse_opco?: number;
          encaisse_soluvia?: number;
          facture_opco?: number;
          facture_soluvia?: number;
          id?: string;
          last_synced_at?: string | null;
          mois: string;
          production_opco?: number;
          production_soluvia?: number;
          projet_id: string;
          reste_a_encaisser?: number;
          reste_a_facturer?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          en_retard?: number;
          encaisse_opco?: number;
          encaisse_soluvia?: number;
          facture_opco?: number;
          facture_soluvia?: number;
          id?: string;
          last_synced_at?: string | null;
          mois?: string;
          production_opco?: number;
          production_soluvia?: number;
          projet_id?: string;
          reste_a_encaisser?: number;
          reste_a_facturer?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'production_mensuelle_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
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
      projets: {
        Row: {
          archive: boolean;
          backup_cdp_id: string | null;
          cdp_id: string | null;
          client_id: string;
          created_at: string;
          date_debut: string | null;
          est_absence: boolean;
          id: string;
          ref: string | null;
          statut: Database['public']['Enums']['statut_projet'];
          taux_commission: number;
          typologie_id: string;
          updated_at: string;
        };
        Insert: {
          archive?: boolean;
          backup_cdp_id?: string | null;
          cdp_id?: string | null;
          client_id: string;
          created_at?: string;
          date_debut?: string | null;
          est_absence?: boolean;
          id?: string;
          ref?: string | null;
          statut?: Database['public']['Enums']['statut_projet'];
          taux_commission?: number;
          typologie_id: string;
          updated_at?: string;
        };
        Update: {
          archive?: boolean;
          backup_cdp_id?: string | null;
          cdp_id?: string | null;
          client_id?: string;
          created_at?: string;
          date_debut?: string | null;
          est_absence?: boolean;
          id?: string;
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
            foreignKeyName: 'projets_typologie_id_fkey';
            columns: ['typologie_id'];
            isOneToOne: false;
            referencedRelation: 'typologies_projet';
            referencedColumns: ['id'];
          },
        ];
      };
      prospect_notes: {
        Row: {
          contenu: string;
          created_at: string;
          id: string;
          prospect_id: string;
          user_id: string;
        };
        Insert: {
          contenu: string;
          created_at?: string;
          id?: string;
          prospect_id: string;
          user_id: string;
        };
        Update: {
          contenu?: string;
          created_at?: string;
          id?: string;
          prospect_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'prospect_notes_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospect_notes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      prospects: {
        Row: {
          archive: boolean;
          client_id: string | null;
          commercial_id: string | null;
          created_at: string;
          dirigeant_email: string | null;
          dirigeant_nom: string | null;
          dirigeant_poste: string | null;
          dirigeant_telephone: string | null;
          emails_generiques: string | null;
          id: string;
          nom: string;
          notes_import: string | null;
          region: string | null;
          siret: string | null;
          site_web: string | null;
          stage: Database['public']['Enums']['stage_prospect'];
          telephone_standard: string | null;
          type_prospect: Database['public']['Enums']['type_prospect'];
          updated_at: string;
          volume_apprenants: number | null;
        };
        Insert: {
          archive?: boolean;
          client_id?: string | null;
          commercial_id?: string | null;
          created_at?: string;
          dirigeant_email?: string | null;
          dirigeant_nom?: string | null;
          dirigeant_poste?: string | null;
          dirigeant_telephone?: string | null;
          emails_generiques?: string | null;
          id?: string;
          nom: string;
          notes_import?: string | null;
          region?: string | null;
          siret?: string | null;
          site_web?: string | null;
          stage?: Database['public']['Enums']['stage_prospect'];
          telephone_standard?: string | null;
          type_prospect: Database['public']['Enums']['type_prospect'];
          updated_at?: string;
          volume_apprenants?: number | null;
        };
        Update: {
          archive?: boolean;
          client_id?: string | null;
          commercial_id?: string | null;
          created_at?: string;
          dirigeant_email?: string | null;
          dirigeant_nom?: string | null;
          dirigeant_poste?: string | null;
          dirigeant_telephone?: string | null;
          emails_generiques?: string | null;
          id?: string;
          nom?: string;
          notes_import?: string | null;
          region?: string | null;
          siret?: string | null;
          site_web?: string | null;
          stage?: Database['public']['Enums']['stage_prospect'];
          telephone_standard?: string | null;
          type_prospect?: Database['public']['Enums']['type_prospect'];
          updated_at?: string;
          volume_apprenants?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prospects_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_commercial_id_fkey';
            columns: ['commercial_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      rdv_commerciaux: {
        Row: {
          commercial_id: string;
          created_at: string;
          date_prevue: string;
          date_realisee: string | null;
          id: string;
          notes: string | null;
          objet: string | null;
          prospect_id: string;
          statut: Database['public']['Enums']['statut_rdv'];
          updated_at: string;
        };
        Insert: {
          commercial_id: string;
          created_at?: string;
          date_prevue: string;
          date_realisee?: string | null;
          id?: string;
          notes?: string | null;
          objet?: string | null;
          prospect_id: string;
          statut?: Database['public']['Enums']['statut_rdv'];
          updated_at?: string;
        };
        Update: {
          commercial_id?: string;
          created_at?: string;
          date_prevue?: string;
          date_realisee?: string | null;
          id?: string;
          notes?: string | null;
          objet?: string | null;
          prospect_id?: string;
          statut?: Database['public']['Enums']['statut_rdv'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rdv_commerciaux_commercial_id_fkey';
            columns: ['commercial_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rdv_commerciaux_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
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
      taches_qualite: {
        Row: {
          created_at: string;
          date_echeance: string | null;
          date_realisation: string | null;
          eduvia_id: number | null;
          eduvia_url: string | null;
          fait: boolean;
          famille_code: string;
          famille_libelle: string | null;
          id: string;
          indicateur: string | null;
          last_synced_at: string | null;
          livrable: string | null;
          projet_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          date_echeance?: string | null;
          date_realisation?: string | null;
          eduvia_id?: number | null;
          eduvia_url?: string | null;
          fait?: boolean;
          famille_code: string;
          famille_libelle?: string | null;
          id?: string;
          indicateur?: string | null;
          last_synced_at?: string | null;
          livrable?: string | null;
          projet_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          date_echeance?: string | null;
          date_realisation?: string | null;
          eduvia_id?: number | null;
          eduvia_url?: string | null;
          fait?: boolean;
          famille_code?: string;
          famille_libelle?: string | null;
          id?: string;
          indicateur?: string | null;
          last_synced_at?: string | null;
          livrable?: string | null;
          projet_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'taches_qualite_projet_id_fkey';
            columns: ['projet_id'];
            isOneToOne: false;
            referencedRelation: 'projets';
            referencedColumns: ['id'];
          },
        ];
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
          avatar_mode: string;
          avatar_regen_date: string | null;
          avatar_seed: string | null;
          can_ship_ideas: boolean;
          can_validate_ideas: boolean;
          created_at: string;
          derniere_connexion: string | null;
          email: string;
          id: string;
          nom: string;
          pipeline_access: boolean;
          prenom: string;
          role: Database['public']['Enums']['role_utilisateur'];
          telephone: string | null;
          updated_at: string;
        };
        Insert: {
          actif?: boolean;
          avatar_mode?: string;
          avatar_regen_date?: string | null;
          avatar_seed?: string | null;
          can_ship_ideas?: boolean;
          can_validate_ideas?: boolean;
          created_at?: string;
          derniere_connexion?: string | null;
          email: string;
          id: string;
          nom: string;
          pipeline_access?: boolean;
          prenom: string;
          role?: Database['public']['Enums']['role_utilisateur'];
          telephone?: string | null;
          updated_at?: string;
        };
        Update: {
          actif?: boolean;
          avatar_mode?: string;
          avatar_regen_date?: string | null;
          avatar_seed?: string | null;
          can_ship_ideas?: boolean;
          can_validate_ideas?: boolean;
          created_at?: string;
          derniere_connexion?: string | null;
          email?: string;
          id?: string;
          nom?: string;
          pipeline_access?: boolean;
          prenom?: string;
          role?: Database['public']['Enums']['role_utilisateur'];
          telephone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_role: { Args: never; Returns: string };
      has_pipeline_access: { Args: never; Returns: boolean };
      has_ship_ideas_access: { Args: never; Returns: boolean };
      has_validate_ideas_access: { Args: never; Returns: boolean };
      is_admin: { Args: never; Returns: boolean };
      is_commercial: { Args: never; Returns: boolean };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
    };
    Enums: {
      cible_idee: 'eduvia' | 'soluvia' | 'workflow' | 'autre';
      role_utilisateur: 'admin' | 'cdp' | 'superadmin' | 'commercial';
      scope_kpi: 'global' | 'projet' | 'cdp';
      stage_prospect: 'non_contacte' | 'r1' | 'r2' | 'signe';
      statut_facture: 'a_emettre' | 'emise' | 'payee' | 'en_retard' | 'avoir';
      statut_idee: 'proposee' | 'validee' | 'implementee' | 'rejetee';
      statut_projet: 'actif' | 'en_pause' | 'termine' | 'archive';
      statut_rdv: 'prevu' | 'realise' | 'annule';
      type_notification:
        | 'facture_retard'
        | 'tache_retard'
        | 'rappel_temps'
        | 'periode_facturation'
        | 'erreur_sync'
        | 'idee_validee'
        | 'idee_rejetee'
        | 'idee_implementee';
      type_prospect: 'cfa' | 'entreprise';
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
  public: {
    Enums: {
      cible_idee: ['eduvia', 'soluvia', 'workflow', 'autre'],
      role_utilisateur: ['admin', 'cdp', 'superadmin', 'commercial'],
      scope_kpi: ['global', 'projet', 'cdp'],
      stage_prospect: ['non_contacte', 'r1', 'r2', 'signe'],
      statut_facture: ['a_emettre', 'emise', 'payee', 'en_retard', 'avoir'],
      statut_idee: ['proposee', 'validee', 'implementee', 'rejetee'],
      statut_projet: ['actif', 'en_pause', 'termine', 'archive'],
      statut_rdv: ['prevu', 'realise', 'annule'],
      type_notification: [
        'facture_retard',
        'tache_retard',
        'rappel_temps',
        'periode_facturation',
        'erreur_sync',
        'idee_validee',
        'idee_rejetee',
        'idee_implementee',
      ],
      type_prospect: ['cfa', 'entreprise'],
    },
  },
} as const;

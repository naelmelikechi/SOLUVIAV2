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
          eduvia_id: number;
          email: string | null;
          id: string;
          last_synced_at: string | null;
          nom: string | null;
          prenom: string | null;
        };
        Insert: {
          contrat_id?: string | null;
          created_at?: string;
          eduvia_id: number;
          email?: string | null;
          id?: string;
          last_synced_at?: string | null;
          nom?: string | null;
          prenom?: string | null;
        };
        Update: {
          contrat_id?: string | null;
          created_at?: string;
          eduvia_id?: number;
          email?: string | null;
          id?: string;
          last_synced_at?: string | null;
          nom?: string | null;
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
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          details?: Json | null;
          created_at?: string;
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
        Relationships: [];
      };
      contrats: {
        Row: {
          apprenant_nom: string | null;
          apprenant_prenom: string | null;
          archive: boolean;
          contract_state: string;
          created_at: string;
          date_debut: string | null;
          date_fin: string | null;
          duree_mois: number | null;
          eduvia_id: number;
          formation_titre: string | null;
          id: string;
          last_synced_at: string | null;
          montant_prise_en_charge: number | null;
          projet_id: string;
          ref: string | null;
          updated_at: string;
        };
        Insert: {
          apprenant_nom?: string | null;
          apprenant_prenom?: string | null;
          archive?: boolean;
          contract_state?: string;
          created_at?: string;
          date_debut?: string | null;
          date_fin?: string | null;
          duree_mois?: number | null;
          eduvia_id: number;
          formation_titre?: string | null;
          id?: string;
          last_synced_at?: string | null;
          montant_prise_en_charge?: number | null;
          projet_id: string;
          ref?: string | null;
          updated_at?: string;
        };
        Update: {
          apprenant_nom?: string | null;
          apprenant_prenom?: string | null;
          archive?: boolean;
          contract_state?: string;
          created_at?: string;
          date_debut?: string | null;
          date_fin?: string | null;
          duree_mois?: number | null;
          eduvia_id?: number;
          formation_titre?: string | null;
          id?: string;
          last_synced_at?: string | null;
          montant_prise_en_charge?: number | null;
          projet_id?: string;
          ref?: string | null;
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
          client_id: string | null;
          created_at: string;
          eduvia_id: number;
          id: string;
          last_synced_at: string | null;
          name: string | null;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          eduvia_id: number;
          id?: string;
          last_synced_at?: string | null;
          name?: string | null;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          eduvia_id?: number;
          id?: string;
          last_synced_at?: string | null;
          name?: string | null;
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
          created_at: string;
          duree: string | null;
          eduvia_id: number;
          id: string;
          last_synced_at: string | null;
          titre: string | null;
        };
        Insert: {
          created_at?: string;
          duree?: string | null;
          eduvia_id: number;
          id?: string;
          last_synced_at?: string | null;
          titre?: string | null;
        };
        Update: {
          created_at?: string;
          duree?: string | null;
          eduvia_id?: number;
          id?: string;
          last_synced_at?: string | null;
          titre?: string | null;
        };
        Relationships: [];
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
          avatar_mode: 'daily' | 'random' | 'frozen';
          avatar_seed: string | null;
          avatar_regen_date: string | null;
          created_at: string;
          derniere_connexion: string | null;
          email: string;
          id: string;
          nom: string;
          prenom: string;
          role: Database['public']['Enums']['role_utilisateur'];
          updated_at: string;
        };
        Insert: {
          actif?: boolean;
          avatar_mode?: 'daily' | 'random' | 'frozen';
          avatar_seed?: string | null;
          avatar_regen_date?: string | null;
          created_at?: string;
          derniere_connexion?: string | null;
          email: string;
          id: string;
          nom: string;
          prenom: string;
          role?: Database['public']['Enums']['role_utilisateur'];
          updated_at?: string;
        };
        Update: {
          actif?: boolean;
          avatar_mode?: 'daily' | 'random' | 'frozen';
          avatar_seed?: string | null;
          avatar_regen_date?: string | null;
          created_at?: string;
          derniere_connexion?: string | null;
          email?: string;
          id?: string;
          nom?: string;
          prenom?: string;
          role?: Database['public']['Enums']['role_utilisateur'];
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_role: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      show_limit: { Args: Record<string, never>; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
    };
    Enums: {
      role_utilisateur: 'admin' | 'cdp' | 'superadmin';
      scope_kpi: 'global' | 'projet' | 'cdp';
      statut_facture: 'a_emettre' | 'emise' | 'payee' | 'en_retard' | 'avoir';
      statut_projet: 'actif' | 'en_pause' | 'termine' | 'archive';
      type_notification:
        | 'facture_retard'
        | 'tache_retard'
        | 'rappel_temps'
        | 'periode_facturation'
        | 'erreur_sync';
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

-- Business references
CREATE INDEX idx_projets_ref ON projets(ref);
CREATE INDEX idx_contrats_ref ON contrats(ref);
CREATE INDEX idx_contrats_eduvia_id ON contrats(eduvia_id);
CREATE INDEX idx_factures_ref ON factures(ref);
CREATE INDEX idx_clients_trigramme ON clients(trigramme);

-- RLS JOIN performance (critical)
CREATE INDEX idx_projets_cdp_id ON projets(cdp_id);
CREATE INDEX idx_projets_backup_cdp_id ON projets(backup_cdp_id);
CREATE INDEX idx_projets_client_id ON projets(client_id);
CREATE INDEX idx_projets_typologie_id ON projets(typologie_id);
CREATE INDEX idx_projets_statut ON projets(statut);

-- Contrats
CREATE INDEX idx_contrats_projet_id ON contrats(projet_id);
CREATE INDEX idx_contrats_state ON contrats(contract_state);

-- Time tracking
CREATE INDEX idx_saisies_user_date ON saisies_temps(user_id, date);
CREATE INDEX idx_saisies_projet_date ON saisies_temps(projet_id, date);
CREATE INDEX idx_saisies_date ON saisies_temps(date);
CREATE INDEX idx_saisies_axes_saisie ON saisies_temps_axes(saisie_id);

-- Invoicing
CREATE INDEX idx_factures_projet_id ON factures(projet_id);
CREATE INDEX idx_factures_client_id ON factures(client_id);
CREATE INDEX idx_factures_statut ON factures(statut);
CREATE INDEX idx_factures_date_emission ON factures(date_emission);
CREATE INDEX idx_factures_date_echeance ON factures(date_echeance);
CREATE INDEX idx_facture_lignes_facture ON facture_lignes(facture_id);
CREATE INDEX idx_facture_lignes_contrat ON facture_lignes(contrat_id);
CREATE INDEX idx_paiements_facture ON paiements(facture_id);
CREATE INDEX idx_echeances_projet ON echeances(projet_id);

-- Production
CREATE INDEX idx_production_mois ON production_mensuelle(mois);
CREATE INDEX idx_production_projet_mois ON production_mensuelle(projet_id, mois);

-- Quality
CREATE INDEX idx_taches_projet ON taches_qualite(projet_id);
CREATE INDEX idx_taches_fait ON taches_qualite(fait);
CREATE INDEX idx_taches_famille ON taches_qualite(famille_code);

-- KPI snapshots
CREATE INDEX idx_snapshots_mois ON kpi_snapshots(mois);
CREATE INDEX idx_snapshots_type_scope ON kpi_snapshots(type_kpi, scope, scope_id);

-- Notifications (partial index for unread)
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at)
  WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Client sub-tables
CREATE INDEX idx_client_contacts_client ON client_contacts(client_id);
CREATE INDEX idx_client_notes_client ON client_notes(client_id);
CREATE INDEX idx_client_docs_client ON client_documents(client_id);
CREATE INDEX idx_client_api_keys_client ON client_api_keys(client_id);

-- Donnees financieres
CREATE INDEX idx_donnees_fin_contrat ON donnees_financieres(contrat_id);
CREATE INDEX idx_donnees_fin_projet ON donnees_financieres(projet_id);

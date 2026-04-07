-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE typologies_projet ENABLE ROW LEVEL SECURITY;
ALTER TABLE axes_temps ENABLE ROW LEVEL SECURITY;
ALTER TABLE projets ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrats ENABLE ROW LEVEL SECURITY;
ALTER TABLE apprenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE formations ENABLE ROW LEVEL SECURITY;
ALTER TABLE eduvia_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE taches_qualite ENABLE ROW LEVEL SECURITY;
ALTER TABLE saisies_temps ENABLE ROW LEVEL SECURITY;
ALTER TABLE saisies_temps_axes ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_mensuelle ENABLE ROW LEVEL SECURITY;
ALTER TABLE donnees_financieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE facture_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE echeances ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE jours_feries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ADMIN: full access on all tables
-- ============================================================
CREATE POLICY admin_all_users ON users FOR ALL USING (is_admin());
CREATE POLICY admin_all_clients ON clients FOR ALL USING (is_admin());
CREATE POLICY admin_all_client_contacts ON client_contacts FOR ALL USING (is_admin());
CREATE POLICY admin_all_client_api_keys ON client_api_keys FOR ALL USING (is_admin());
CREATE POLICY admin_all_client_notes ON client_notes FOR ALL USING (is_admin());
CREATE POLICY admin_all_client_documents ON client_documents FOR ALL USING (is_admin());
CREATE POLICY admin_all_projets ON projets FOR ALL USING (is_admin());
CREATE POLICY admin_all_contrats ON contrats FOR ALL USING (is_admin());
CREATE POLICY admin_all_apprenants ON apprenants FOR ALL USING (is_admin());
CREATE POLICY admin_all_formations ON formations FOR ALL USING (is_admin());
CREATE POLICY admin_all_eduvia_companies ON eduvia_companies FOR ALL USING (is_admin());
CREATE POLICY admin_all_taches_qualite ON taches_qualite FOR ALL USING (is_admin());
CREATE POLICY admin_all_saisies_temps ON saisies_temps FOR ALL USING (is_admin());
CREATE POLICY admin_all_saisies_axes ON saisies_temps_axes FOR ALL USING (is_admin());
CREATE POLICY admin_all_production ON production_mensuelle FOR ALL USING (is_admin());
CREATE POLICY admin_all_donnees_fin ON donnees_financieres FOR ALL USING (is_admin());
CREATE POLICY admin_select_factures ON factures FOR SELECT USING (is_admin());
CREATE POLICY admin_insert_factures ON factures FOR INSERT WITH CHECK (is_admin());
CREATE POLICY admin_update_factures ON factures FOR UPDATE USING (is_admin());
-- NO DELETE policy on factures (French legal requirement)
CREATE POLICY admin_all_facture_lignes ON facture_lignes FOR ALL USING (is_admin());
CREATE POLICY admin_all_paiements ON paiements FOR ALL USING (is_admin());
CREATE POLICY admin_all_echeances ON echeances FOR ALL USING (is_admin());
CREATE POLICY admin_all_snapshots ON kpi_snapshots FOR ALL USING (is_admin());
CREATE POLICY admin_all_notifications ON notifications FOR ALL USING (is_admin());
CREATE POLICY admin_all_parametres ON parametres FOR ALL USING (is_admin());
CREATE POLICY admin_all_jours_feries ON jours_feries FOR ALL USING (is_admin());

-- ============================================================
-- CDP: filtered access
-- ============================================================

-- Users: read self + all users (for display)
CREATE POLICY cdp_read_users ON users FOR SELECT USING (true);

-- Clients: read-only access to all
CREATE POLICY cdp_read_clients ON clients FOR SELECT USING (true);
CREATE POLICY cdp_read_client_contacts ON client_contacts FOR SELECT USING (true);
CREATE POLICY cdp_read_client_api_keys ON client_api_keys FOR SELECT USING (true);

-- Client notes: read all + insert own
CREATE POLICY cdp_read_client_notes ON client_notes FOR SELECT USING (true);
CREATE POLICY cdp_insert_client_notes ON client_notes FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Client documents: read all + insert own
CREATE POLICY cdp_read_client_documents ON client_documents FOR SELECT USING (true);
CREATE POLICY cdp_insert_client_documents ON client_documents FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Reference tables: readable by all authenticated
CREATE POLICY read_typologies ON typologies_projet FOR SELECT USING (true);
CREATE POLICY read_axes ON axes_temps FOR SELECT USING (true);
CREATE POLICY read_jours_feries ON jours_feries FOR SELECT USING (true);

-- Projets: CDP sees only own projects
CREATE POLICY cdp_read_projets ON projets FOR SELECT
  USING (cdp_id = auth.uid() OR backup_cdp_id = auth.uid());

-- Contrats: CDP sees contracts of own projects
CREATE POLICY cdp_read_contrats ON contrats FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = contrats.projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

-- Apprenants, formations, eduvia_companies: read all
CREATE POLICY cdp_read_apprenants ON apprenants FOR SELECT USING (true);
CREATE POLICY cdp_read_formations ON formations FOR SELECT USING (true);
CREATE POLICY cdp_read_eduvia_companies ON eduvia_companies FOR SELECT USING (true);

-- Quality tasks: CDP sees own project tasks
CREATE POLICY cdp_read_taches ON taches_qualite FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = taches_qualite.projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

-- Time entries: CDP manages own entries
CREATE POLICY cdp_own_saisies ON saisies_temps FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY cdp_own_axes ON saisies_temps_axes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM saisies_temps st WHERE st.id = saisies_temps_axes.saisie_id
      AND st.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM saisies_temps st WHERE st.id = saisie_id
      AND st.user_id = auth.uid()
  ));

-- Production: CDP sees own project data
CREATE POLICY cdp_read_production ON production_mensuelle FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = production_mensuelle.projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

CREATE POLICY cdp_read_donnees_fin ON donnees_financieres FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = donnees_financieres.projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

-- Factures: CDP reads + creates on own projects (no delete)
CREATE POLICY cdp_read_factures ON factures FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = factures.projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

CREATE POLICY cdp_insert_factures ON factures FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

CREATE POLICY cdp_read_facture_lignes ON facture_lignes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM factures f JOIN projets p ON f.projet_id = p.id
    WHERE f.id = facture_lignes.facture_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

CREATE POLICY cdp_read_paiements ON paiements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM factures f JOIN projets p ON f.projet_id = p.id
    WHERE f.id = paiements.facture_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

CREATE POLICY cdp_read_echeances ON echeances FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projets p WHERE p.id = echeances.projet_id
      AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
  ));

-- KPI snapshots: read global + own scope (no UPDATE/DELETE)
CREATE POLICY cdp_read_snapshots ON kpi_snapshots FOR SELECT
  USING (
    scope = 'global'
    OR (scope = 'cdp' AND scope_id = auth.uid())
    OR (scope = 'projet' AND EXISTS (
      SELECT 1 FROM projets p WHERE p.id = kpi_snapshots.scope_id
        AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
    ))
  );

-- Notifications: own only
CREATE POLICY cdp_read_notifications ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY cdp_update_notifications ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Parametres: admin only (CDP has no access -- spec 09 line 232)
-- No CDP policy needed

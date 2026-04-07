-- Business reference triggers
CREATE TRIGGER trg_projet_ref
  BEFORE INSERT ON projets
  FOR EACH ROW EXECUTE FUNCTION generate_projet_ref();

CREATE TRIGGER trg_contrat_ref
  BEFORE INSERT ON contrats
  FOR EACH ROW EXECUTE FUNCTION generate_contrat_ref();

CREATE TRIGGER trg_facture_ref
  BEFORE INSERT ON factures
  FOR EACH ROW EXECUTE FUNCTION generate_facture_ref();

CREATE TRIGGER trg_client_trigramme
  BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION generate_trigramme();

-- Daily hours validation
CREATE TRIGGER trg_check_daily_hours
  BEFORE INSERT OR UPDATE ON saisies_temps
  FOR EACH ROW EXECUTE FUNCTION check_daily_hours_max();

-- Auto-update updated_at triggers
CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_clients_updated
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_projets_updated
  BEFORE UPDATE ON projets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contrats_updated
  BEFORE UPDATE ON contrats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_saisies_temps_updated
  BEFORE UPDATE ON saisies_temps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_production_updated
  BEFORE UPDATE ON production_mensuelle
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_factures_updated
  BEFORE UPDATE ON factures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_echeances_updated
  BEFORE UPDATE ON echeances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_taches_qualite_updated
  BEFORE UPDATE ON taches_qualite
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_donnees_financieres_updated
  BEFORE UPDATE ON donnees_financieres
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

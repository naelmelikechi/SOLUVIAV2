CREATE INDEX IF NOT EXISTS idx_contrats_projet_archive ON contrats(projet_id, archive);
CREATE INDEX IF NOT EXISTS idx_factures_statut ON factures(statut);
CREATE INDEX IF NOT EXISTS idx_factures_odoo_id ON factures(odoo_id) WHERE odoo_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_saisies_temps_user_date ON saisies_temps(user_id, date);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at) WHERE read_at IS NULL;

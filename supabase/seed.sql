-- ============================================================
-- SEED DATA
-- ============================================================

-- Typologies
INSERT INTO typologies_projet (code, libelle) VALUES
  ('APP', 'Apprentissage'),
  ('POE', 'POEI (Preparation Operationnelle a l''Emploi Individuelle)'),
  ('PDC', 'Plan de Developpement des Competences'),
  ('ABS', 'Absence');

-- Time tracking axes
INSERT INTO axes_temps (code, libelle, couleur, ordre) VALUES
  ('accompagnement', 'Accompagnement', '#16a34a', 1),
  ('pedagogie', 'Pedagogie', '#059669', 2),
  ('administratif', 'Administratif', '#0d9488', 3),
  ('qualite', 'Qualite', '#0891b2', 4),
  ('commercial', 'Commercial', '#6366f1', 5);

-- System clients for absence projects
INSERT INTO clients (id, trigramme, raison_sociale) VALUES
  ('00000000-0000-0000-0000-000000000001', 'CON', 'Conges (systeme)'),
  ('00000000-0000-0000-0000-000000000002', 'MAL', 'Maladie (systeme)'),
  ('00000000-0000-0000-0000-000000000003', 'FER', 'Feries (systeme)');

-- Absence projects (refs set manually)
INSERT INTO projets (ref, client_id, typologie_id, statut, est_absence) VALUES
  ('9999-CON-ABS', '00000000-0000-0000-0000-000000000001',
   (SELECT id FROM typologies_projet WHERE code = 'ABS'), 'actif', true),
  ('9998-MAL-ABS', '00000000-0000-0000-0000-000000000002',
   (SELECT id FROM typologies_projet WHERE code = 'ABS'), 'actif', true),
  ('9997-FER-ABS', '00000000-0000-0000-0000-000000000003',
   (SELECT id FROM typologies_projet WHERE code = 'ABS'), 'actif', true);

-- French bank holidays 2026
INSERT INTO jours_feries (date, libelle, annee) VALUES
  ('2026-01-01', 'Jour de l''An', 2026),
  ('2026-04-06', 'Lundi de Paques', 2026),
  ('2026-05-01', 'Fete du Travail', 2026),
  ('2026-05-08', 'Victoire 1945', 2026),
  ('2026-05-14', 'Ascension', 2026),
  ('2026-05-25', 'Lundi de Pentecote', 2026),
  ('2026-07-14', 'Fete Nationale', 2026),
  ('2026-08-15', 'Assomption', 2026),
  ('2026-11-01', 'Toussaint', 2026),
  ('2026-11-11', 'Armistice', 2026),
  ('2026-12-25', 'Noel', 2026);

-- Default system parameters
INSERT INTO parametres (cle, valeur, categorie, description) VALUES
  ('entreprise.raison_sociale', 'SOLUVIA SAS', 'entreprise', 'Raison sociale'),
  ('entreprise.adresse', '123 Rue de la Formation, 75001 Paris', 'entreprise', 'Adresse'),
  ('entreprise.siret', '123 456 789 00012', 'entreprise', 'SIRET'),
  ('entreprise.tva_intracommunautaire', 'FR12 123456789', 'entreprise', 'TVA intra'),
  ('entreprise.email', 'contact@soluvia.fr', 'entreprise', 'Email de contact'),
  ('facturation.taux_tva', '20', 'facturation', 'Taux TVA par defaut (%)'),
  ('facturation.fenetre_debut', '25', 'facturation', 'Jour debut fenetre facturation'),
  ('facturation.fenetre_fin', '3', 'facturation', 'Jour fin fenetre facturation'),
  ('facturation.delai_echeance_jours', '30', 'facturation', 'Delai echeance en jours'),
  ('facturation.mentions_legales', 'Conditions de paiement : 30 jours fin de mois. En cas de retard de paiement, une penalite de 3 fois le taux d''interet legal sera appliquee, ainsi qu''une indemnite forfaitaire de 40 EUR pour frais de recouvrement. Pas d''escompte pour paiement anticipe.', 'facturation', 'Mentions legales facture');

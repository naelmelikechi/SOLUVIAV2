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
  ('entreprise.raison_sociale', 'SOLUVIA', 'entreprise', 'Raison sociale'),
  ('entreprise.adresse', '27 Rue Jacqueline Cochran, 79000 Niort', 'entreprise', 'Adresse'),
  ('entreprise.siret', '994 241 537 00012', 'entreprise', 'SIRET'),
  ('entreprise.tva_intracommunautaire', 'FR37994241537', 'entreprise', 'TVA intra'),
  ('entreprise.email', 'contact@mysoluvia.com', 'entreprise', 'Email de contact'),
  ('facturation.taux_tva', '20', 'facturation', 'Taux TVA par defaut (%)'),
  ('facturation.fenetre_debut', '25', 'facturation', 'Jour debut fenetre facturation'),
  ('facturation.fenetre_fin', '3', 'facturation', 'Jour fin fenetre facturation'),
  ('facturation.delai_echeance_jours', '30', 'facturation', 'Delai echeance en jours'),
  ('facturation.mentions_legales', 'Conditions de paiement : 30 jours fin de mois. En cas de retard de paiement, une penalite de 3 fois le taux d''interet legal sera appliquee, ainsi qu''une indemnite forfaitaire de 40 EUR pour frais de recouvrement. Pas d''escompte pour paiement anticipe.', 'facturation', 'Mentions legales facture');


-- ============================================================
-- DONNEES DE DEMONSTRATION
-- ============================================================

-- ----------------------------------------------------------
-- 4 Clients de demo
-- ----------------------------------------------------------
INSERT INTO clients (id, trigramme, raison_sociale, siret, adresse, localisation, date_entree) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'HEO', 'Heol Formation', '12345678901234', '10 Rue de Brest, 29200 Brest', 'Bretagne', '2024-01-15'),
  ('c1000000-0000-0000-0000-000000000002', 'DUP', 'Dupont Academy', '98765432109876', '45 Avenue des Champs, 75008 Paris', 'Ile-de-France', '2024-03-01'),
  ('c1000000-0000-0000-0000-000000000003', 'FOR', 'FormaSud', '11223344556677', '12 Boulevard Victor Hugo, 13001 Marseille', 'PACA', '2024-06-10'),
  ('c1000000-0000-0000-0000-000000000004', 'NOR', 'NordFormation', '99887766554433', '8 Rue de la Gare, 59000 Lille', 'Hauts-de-France', '2025-01-20');

-- Client contacts (one per client)
INSERT INTO client_contacts (id, client_id, nom, poste, email, telephone) VALUES
  ('cc100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Marie Le Gall', 'Directrice', 'marie.legall@heol.fr', '02 98 01 02 03'),
  ('cc100000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'Jean Dupont', 'Gerant', 'jean.dupont@dupont-academy.fr', '01 45 67 89 00'),
  ('cc100000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 'Sophie Martin', 'Responsable formation', 'sophie.martin@formasud.fr', '04 91 23 45 67'),
  ('cc100000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000004', 'Pierre Leroy', 'Directeur pedagogique', 'pierre.leroy@nordformation.fr', '03 20 11 22 33');

-- ----------------------------------------------------------
-- 6 Projets de demo (ref auto-generated by trigger)
-- cdp_id = first user found in users table
-- ----------------------------------------------------------
INSERT INTO projets (id, client_id, typologie_id, cdp_id, statut, date_debut, taux_commission) VALUES
  -- Heol Formation - Apprentissage
  ('b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001',
   (SELECT id FROM typologies_projet WHERE code = 'APP'),
   (SELECT id FROM users ORDER BY created_at LIMIT 1),
   'actif', '2025-01-15', 10.00),
  -- Heol Formation - POEI
  ('b1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001',
   (SELECT id FROM typologies_projet WHERE code = 'POE'),
   (SELECT id FROM users ORDER BY created_at LIMIT 1),
   'actif', '2025-03-01', 8.50),
  -- Dupont Academy - Apprentissage
  ('b1000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000002',
   (SELECT id FROM typologies_projet WHERE code = 'APP'),
   (SELECT id FROM users ORDER BY created_at LIMIT 1),
   'actif', '2025-02-01', 10.00),
  -- Dupont Academy - PDC
  ('b1000000-0000-0000-0000-000000000004',
   'c1000000-0000-0000-0000-000000000002',
   (SELECT id FROM typologies_projet WHERE code = 'PDC'),
   (SELECT id FROM users ORDER BY created_at LIMIT 1),
   'actif', '2025-04-01', 12.00),
  -- FormaSud - Apprentissage
  ('b1000000-0000-0000-0000-000000000005',
   'c1000000-0000-0000-0000-000000000003',
   (SELECT id FROM typologies_projet WHERE code = 'APP'),
   (SELECT id FROM users ORDER BY created_at LIMIT 1),
   'actif', '2025-06-01', 10.00),
  -- NordFormation - POEI (en pause)
  ('b1000000-0000-0000-0000-000000000006',
   'c1000000-0000-0000-0000-000000000004',
   (SELECT id FROM typologies_projet WHERE code = 'POE'),
   (SELECT id FROM users ORDER BY created_at LIMIT 1),
   'en_pause', '2025-01-20', 9.00);

-- ----------------------------------------------------------
-- Contrats (2-3 par projet, 15 total) - ref auto-generated
-- ----------------------------------------------------------
INSERT INTO contrats (id, eduvia_id, projet_id, apprenant_nom, apprenant_prenom, formation_titre, date_debut, date_fin, contract_state, montant_prise_en_charge, duree_mois) VALUES
  -- Projet 1 (Heol-APP): 3 contrats
  ('c0100000-0000-0000-0000-000000000001', 90001, 'b1000000-0000-0000-0000-000000000001',
   'Kerlouegan', 'Yann', 'Developpeur Web Full Stack', '2025-01-15', '2026-01-14', 'actif', 12000.00, 12),
  ('c0100000-0000-0000-0000-000000000002', 90002, 'b1000000-0000-0000-0000-000000000001',
   'Le Bihan', 'Anna', 'Developpeur Web Full Stack', '2025-01-15', '2026-01-14', 'actif', 11500.00, 12),
  ('c0100000-0000-0000-0000-000000000003', 90003, 'b1000000-0000-0000-0000-000000000001',
   'Morvan', 'Elodie', 'Administrateur Systemes et Reseaux', '2025-02-01', '2027-01-31', 'actif', 15000.00, 24),
  -- Projet 2 (Heol-POE): 2 contrats
  ('c0100000-0000-0000-0000-000000000004', 90004, 'b1000000-0000-0000-0000-000000000002',
   'Calvez', 'Nolwenn', 'Data Analyst', '2025-03-01', '2025-08-31', 'actif', 7500.00, 6),
  ('c0100000-0000-0000-0000-000000000005', 90005, 'b1000000-0000-0000-0000-000000000002',
   'Perrot', 'Gwenael', 'Data Analyst', '2025-03-01', '2025-08-31', 'actif', 7500.00, 6),
  -- Projet 3 (Dupont-APP): 3 contrats
  ('c0100000-0000-0000-0000-000000000006', 90006, 'b1000000-0000-0000-0000-000000000003',
   'Martin', 'Lucas', 'Comptabilite Gestion', '2025-02-01', '2027-01-31', 'actif', 14000.00, 24),
  ('c0100000-0000-0000-0000-000000000007', 90007, 'b1000000-0000-0000-0000-000000000003',
   'Petit', 'Emma', 'Comptabilite Gestion', '2025-02-01', '2027-01-31', 'actif', 14000.00, 24),
  ('c0100000-0000-0000-0000-000000000008', 90008, 'b1000000-0000-0000-0000-000000000003',
   'Durand', 'Hugo', 'Ressources Humaines', '2025-03-01', '2026-02-28', 'actif', 9500.00, 12),
  -- Projet 4 (Dupont-PDC): 2 contrats
  ('c0100000-0000-0000-0000-000000000009', 90009, 'b1000000-0000-0000-0000-000000000004',
   'Lefebvre', 'Julie', 'Management d''equipe', '2025-04-01', '2025-09-30', 'actif', 6000.00, 6),
  ('c0100000-0000-0000-0000-000000000010', 90010, 'b1000000-0000-0000-0000-000000000004',
   'Roux', 'Antoine', 'Management d''equipe', '2025-04-01', '2025-09-30', 'actif', 6000.00, 6),
  -- Projet 5 (FormaSud-APP): 3 contrats
  ('c0100000-0000-0000-0000-000000000011', 90011, 'b1000000-0000-0000-0000-000000000005',
   'Garcia', 'Lea', 'Technicien Superieur en Reseaux', '2025-06-01', '2027-05-31', 'actif', 13000.00, 24),
  ('c0100000-0000-0000-0000-000000000012', 90012, 'b1000000-0000-0000-0000-000000000005',
   'Lopez', 'Mathieu', 'Technicien Superieur en Reseaux', '2025-06-01', '2027-05-31', 'actif', 13000.00, 24),
  ('c0100000-0000-0000-0000-000000000013', 90013, 'b1000000-0000-0000-0000-000000000005',
   'Nguyen', 'Camille', 'Developpeur Web Full Stack', '2025-07-01', '2026-06-30', 'actif', 11000.00, 12),
  -- Projet 6 (NordFormation-POE): 2 contrats
  ('c0100000-0000-0000-0000-000000000014', 90014, 'b1000000-0000-0000-0000-000000000006',
   'Bernard', 'Chloe', 'Charge(e) de Communication', '2025-01-20', '2025-07-19', 'actif', 8000.00, 6),
  ('c0100000-0000-0000-0000-000000000015', 90015, 'b1000000-0000-0000-0000-000000000006',
   'Thomas', 'Maxime', 'Charge(e) de Communication', '2025-01-20', '2025-07-19', 'actif', 8000.00, 6);

-- ----------------------------------------------------------
-- Taches qualite (3-5 par projet, mix fait=true/false)
-- ----------------------------------------------------------
INSERT INTO taches_qualite (id, projet_id, famille_code, famille_libelle, indicateur, livrable, fait, date_echeance) VALUES
  -- Projet 1
  ('00100000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'C1', 'Conditions d''information', 'Information prealable', 'Fiche formation publiee', true, '2025-02-15'),
  ('00100000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'C2', 'Objectifs de formation', 'Competences visees definies', 'Referentiel competences', true, '2025-02-28'),
  ('00100000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'ADM', 'Administratif', 'Dossier administratif complet', 'Cerfa signe', false, '2025-04-30'),
  ('00100000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'HQ', 'Hors Qualiopi', 'Suivi mensuel', 'Rapport mensuel', false, '2025-05-31'),
  -- Projet 2
  ('00100000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000002', 'C1', 'Conditions d''information', 'Information prealable', 'Programme de formation', true, '2025-03-15'),
  ('00100000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000002', 'ADM', 'Administratif', 'Convention signee', 'Convention tripartite', false, '2025-04-15'),
  ('00100000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 'C2', 'Objectifs de formation', 'Evaluation initiale', 'Test de positionnement', true, '2025-03-31'),
  -- Projet 3
  ('00100000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000003', 'C1', 'Conditions d''information', 'Information prealable', 'Plaquette formation', true, '2025-02-20'),
  ('00100000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000003', 'C2', 'Objectifs de formation', 'Competences visees', 'Referentiel RNCP', true, '2025-03-15'),
  ('00100000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000003', 'ADM', 'Administratif', 'Contrat signe', 'Contrat apprentissage', false, '2025-04-30'),
  ('00100000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000003', 'HQ', 'Hors Qualiopi', 'Bilan intermediaire', 'Compte-rendu bilan', false, '2025-06-30'),
  ('00100000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000003', 'C1', 'Conditions d''information', 'Reglement interieur', 'RI signe', true, '2025-03-01'),
  -- Projet 4
  ('00100000-0000-0000-0000-000000000013', 'b1000000-0000-0000-0000-000000000004', 'C1', 'Conditions d''information', 'Programme detaille', 'Syllabus', true, '2025-04-15'),
  ('00100000-0000-0000-0000-000000000014', 'b1000000-0000-0000-0000-000000000004', 'ADM', 'Administratif', 'Convention formation', 'Convention signee', false, '2025-05-01'),
  ('00100000-0000-0000-0000-000000000015', 'b1000000-0000-0000-0000-000000000004', 'C2', 'Objectifs de formation', 'Modalites evaluation', 'Grille evaluation', false, '2025-05-15'),
  -- Projet 5
  ('00100000-0000-0000-0000-000000000016', 'b1000000-0000-0000-0000-000000000005', 'C1', 'Conditions d''information', 'Information prealable', 'Fiche formation', true, '2025-06-15'),
  ('00100000-0000-0000-0000-000000000017', 'b1000000-0000-0000-0000-000000000005', 'C2', 'Objectifs de formation', 'Positionnement initial', 'Test entree', false, '2025-07-01'),
  ('00100000-0000-0000-0000-000000000018', 'b1000000-0000-0000-0000-000000000005', 'ADM', 'Administratif', 'Dossier inscription', 'Dossier complet', false, '2025-07-15'),
  -- Projet 6
  ('00100000-0000-0000-0000-000000000019', 'b1000000-0000-0000-0000-000000000006', 'C1', 'Conditions d''information', 'Programme formation', 'Programme detaille', true, '2025-02-01'),
  ('00100000-0000-0000-0000-000000000020', 'b1000000-0000-0000-0000-000000000006', 'ADM', 'Administratif', 'Convention POEI', 'Convention signee', true, '2025-02-15'),
  ('00100000-0000-0000-0000-000000000021', 'b1000000-0000-0000-0000-000000000006', 'HQ', 'Hors Qualiopi', 'Suivi entreprise', 'CR visite entreprise', false, '2025-04-30');

-- ----------------------------------------------------------
-- Saisies temps (current month - avril 2026)
-- ----------------------------------------------------------
INSERT INTO saisies_temps (id, user_id, projet_id, date, heures) VALUES
  -- Semaine du 6 avril 2026
  ('50100000-0000-0000-0000-000000000001', (SELECT id FROM users ORDER BY created_at LIMIT 1), 'b1000000-0000-0000-0000-000000000001', '2026-04-06', 3.00),
  ('50100000-0000-0000-0000-000000000002', (SELECT id FROM users ORDER BY created_at LIMIT 1), 'b1000000-0000-0000-0000-000000000003', '2026-04-06', 4.00),
  ('50100000-0000-0000-0000-000000000003', (SELECT id FROM users ORDER BY created_at LIMIT 1), 'b1000000-0000-0000-0000-000000000001', '2026-04-07', 5.00),
  ('50100000-0000-0000-0000-000000000004', (SELECT id FROM users ORDER BY created_at LIMIT 1), 'b1000000-0000-0000-0000-000000000002', '2026-04-07', 2.00),
  ('50100000-0000-0000-0000-000000000005', (SELECT id FROM users ORDER BY created_at LIMIT 1), 'b1000000-0000-0000-0000-000000000003', '2026-04-08', 7.00),
  ('50100000-0000-0000-0000-000000000006', (SELECT id FROM users ORDER BY created_at LIMIT 1), 'b1000000-0000-0000-0000-000000000001', '2026-04-09', 4.00),
  ('50100000-0000-0000-0000-000000000007', (SELECT id FROM users ORDER BY created_at LIMIT 1), 'b1000000-0000-0000-0000-000000000005', '2026-04-09', 3.00),
  ('50100000-0000-0000-0000-000000000008', (SELECT id FROM users ORDER BY created_at LIMIT 1), 'b1000000-0000-0000-0000-000000000004', '2026-04-10', 6.00);

-- ----------------------------------------------------------
-- Echeances (mix of pending and linked to factures)
-- ----------------------------------------------------------
INSERT INTO echeances (id, projet_id, mois_concerne, date_emission_prevue, montant_prevu_ht, validee) VALUES
  -- Projet 1: 3 echeances (jan, fev, mars 2025)
  ('ec100000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '2025-01-01', '2025-02-01', 320.83, true),
  ('ec100000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', '2025-02-01', '2025-03-01', 320.83, true),
  ('ec100000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', '2025-03-01', '2025-04-01', 320.83, false),
  -- Projet 3: 2 echeances
  ('ec100000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000003', '2025-02-01', '2025-03-01', 260.42, true),
  ('ec100000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000003', '2025-03-01', '2025-04-01', 260.42, false),
  -- Projet 5: 1 echeance
  ('ec100000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000005', '2025-06-01', '2025-07-01', 308.33, false);

-- ----------------------------------------------------------
-- Factures (2 factures: 1 emise, 1 payee) - ref auto-generated
-- ----------------------------------------------------------
INSERT INTO factures (id, projet_id, client_id, date_emission, date_echeance, mois_concerne, montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir, created_by) VALUES
  -- Facture 1: Projet 1, janvier 2025 (payee)
  ('fa100000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001',
   '2025-02-01', '2025-03-03', 'janvier 2025',
   320.83, 20.00, 64.17, 385.00,
   'payee', false,
   (SELECT id FROM users ORDER BY created_at LIMIT 1)),
  -- Facture 2: Projet 1, fevrier 2025 (emise, en attente)
  ('fa100000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001',
   '2025-03-01', '2025-03-31', 'fevrier 2025',
   320.83, 20.00, 64.17, 385.00,
   'emise', false,
   (SELECT id FROM users ORDER BY created_at LIMIT 1)),
  -- Facture 3: Projet 3, fevrier 2025 (en retard)
  ('fa100000-0000-0000-0000-000000000003',
   'b1000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000002',
   '2025-03-01', '2025-03-31', 'fevrier 2025',
   260.42, 20.00, 52.08, 312.50,
   'en_retard', false,
   (SELECT id FROM users ORDER BY created_at LIMIT 1));

-- Link echeances to factures
UPDATE echeances SET facture_id = 'fa100000-0000-0000-0000-000000000001' WHERE id = 'ec100000-0000-0000-0000-000000000001';
UPDATE echeances SET facture_id = 'fa100000-0000-0000-0000-000000000002' WHERE id = 'ec100000-0000-0000-0000-000000000002';
UPDATE echeances SET facture_id = 'fa100000-0000-0000-0000-000000000003' WHERE id = 'ec100000-0000-0000-0000-000000000004';

-- ----------------------------------------------------------
-- Facture lignes
-- ----------------------------------------------------------
INSERT INTO facture_lignes (id, facture_id, contrat_id, description, montant_ht) VALUES
  -- Facture 1 lignes
  ('f1100000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'c0100000-0000-0000-0000-000000000001',
   'Commission 10% - Developpeur Web Full Stack - Yann Kerlouegan - janvier 2025', 100.00),
  ('f1100000-0000-0000-0000-000000000002', 'fa100000-0000-0000-0000-000000000001', 'c0100000-0000-0000-0000-000000000002',
   'Commission 10% - Developpeur Web Full Stack - Anna Le Bihan - janvier 2025', 95.83),
  ('f1100000-0000-0000-0000-000000000003', 'fa100000-0000-0000-0000-000000000001', 'c0100000-0000-0000-0000-000000000003',
   'Commission 10% - Admin Systemes et Reseaux - Elodie Morvan - janvier 2025', 125.00),
  -- Facture 2 lignes
  ('f1100000-0000-0000-0000-000000000004', 'fa100000-0000-0000-0000-000000000002', 'c0100000-0000-0000-0000-000000000001',
   'Commission 10% - Developpeur Web Full Stack - Yann Kerlouegan - fevrier 2025', 100.00),
  ('f1100000-0000-0000-0000-000000000005', 'fa100000-0000-0000-0000-000000000002', 'c0100000-0000-0000-0000-000000000002',
   'Commission 10% - Developpeur Web Full Stack - Anna Le Bihan - fevrier 2025', 95.83),
  ('f1100000-0000-0000-0000-000000000006', 'fa100000-0000-0000-0000-000000000002', 'c0100000-0000-0000-0000-000000000003',
   'Commission 10% - Admin Systemes et Reseaux - Elodie Morvan - fevrier 2025', 125.00),
  -- Facture 3 lignes
  ('f1100000-0000-0000-0000-000000000007', 'fa100000-0000-0000-0000-000000000003', 'c0100000-0000-0000-0000-000000000006',
   'Commission 10% - Comptabilite Gestion - Lucas Martin - fevrier 2025', 58.33),
  ('f1100000-0000-0000-0000-000000000008', 'fa100000-0000-0000-0000-000000000003', 'c0100000-0000-0000-0000-000000000007',
   'Commission 10% - Comptabilite Gestion - Emma Petit - fevrier 2025', 58.33),
  ('f1100000-0000-0000-0000-000000000009', 'fa100000-0000-0000-0000-000000000003', 'c0100000-0000-0000-0000-000000000008',
   'Commission 10% - Ressources Humaines - Hugo Durand - fevrier 2025', 143.75);

-- ----------------------------------------------------------
-- Paiement (sur facture 1 - payee)
-- ----------------------------------------------------------
INSERT INTO paiements (id, facture_id, montant, date_reception, saisie_manuelle) VALUES
  ('0a100000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 385.00, '2025-02-25', false);

-- ----------------------------------------------------------
-- Notification de demo
-- ----------------------------------------------------------
INSERT INTO notifications (id, user_id, type, titre, message, lien) VALUES
  ('00100000-0000-0000-0000-000000000001',
   (SELECT id FROM users ORDER BY created_at LIMIT 1),
   'facture_retard',
   'Facture en retard',
   'La facture du projet Dupont Academy - Comptabilite est en retard de paiement depuis le 31/03/2025.',
   '/facturation');

// @ts-nocheck - scheduled for deletion in the mock→Supabase refactor.
// Exempt from noUncheckedIndexedAccess since this file is dead code walking.
// Mock data for development -- will be replaced by Supabase queries

export interface MockUser {
  id: string;
  nom: string;
  prenom: string;
  role: 'admin' | 'cdp';
  email: string;
}

export interface MockClient {
  id: string;
  trigramme: string;
  raison_sociale: string;
  siret: string;
  adresse: string;
  localisation: string;
}

export interface MockProjet {
  id: string;
  ref: string;
  client: MockClient;
  typologie: { code: string; libelle: string };
  cdp: MockUser;
  backup_cdp: MockUser | null;
  statut: 'actif' | 'en_pause' | 'termine' | 'archive';
  date_debut: string;
  taux_commission: number;
  // Computed/aggregated fields for list view
  apprentis_actifs: number;
  taches_a_realiser: number;
  factures_en_retard: number;
  encaissements_en_retard: number;
  temps_mois_courant: number;
}

export interface MockContrat {
  id: string;
  ref: string;
  projet_id: string;
  apprenant_nom: string;
  apprenant_prenom: string;
  formation_titre: string;
  date_debut: string;
  date_fin: string;
  contract_state: 'actif' | 'suspendu' | 'resilie' | 'termine';
  montant_prise_en_charge: number;
  progression_reelle: number;
  progression_theorique: number;
}

export interface MockFinanceProjet {
  production_opco: number;
  facture_opco: number;
  encaisse_opco: number;
  taux_commission: number;
}

export interface MockTempsProjet {
  total: number;
  mois_label: string;
  axes: { code: string; label: string; heures: number; color: string }[];
}

export interface MockQualiteProjet {
  terminees: number;
  a_realiser: number;
}

// ============================================================
// USERS
// ============================================================
export const MOCK_USERS: MockUser[] = [
  {
    id: 'u1',
    nom: 'Benkoussa',
    prenom: 'Ilies',
    role: 'admin',
    email: 'ilies@soluvia.fr',
  },
  {
    id: 'u2',
    nom: 'Martin',
    prenom: 'Sophie',
    role: 'cdp',
    email: 'sophie@soluvia.fr',
  },
  {
    id: 'u3',
    nom: 'Durand',
    prenom: 'Thomas',
    role: 'cdp',
    email: 'thomas@soluvia.fr',
  },
  {
    id: 'u4',
    nom: 'Petit',
    prenom: 'Marie',
    role: 'cdp',
    email: 'marie@soluvia.fr',
  },
];

// ============================================================
// CLIENTS
// ============================================================
export const MOCK_CLIENTS: MockClient[] = [
  {
    id: 'c1',
    trigramme: 'DUP',
    raison_sociale: 'Dupont Formation SAS',
    siret: '412 345 678 00012',
    adresse: '45 Rue de la Paix',
    localisation: 'Paris 75002',
  },
  {
    id: 'c2',
    trigramme: 'TEC',
    raison_sociale: 'TechForm Academy',
    siret: '523 456 789 00034',
    adresse: '12 Avenue des Champs',
    localisation: 'Lyon 69003',
  },
  {
    id: 'c3',
    trigramme: 'FOR',
    raison_sociale: 'FormaPro International',
    siret: '634 567 890 00056',
    adresse: '8 Boulevard Haussmann',
    localisation: 'Marseille 13001',
  },
  {
    id: 'c4',
    trigramme: 'ACA',
    raison_sociale: 'Academie du Numerique',
    siret: '745 678 901 00078',
    adresse: '22 Rue du Commerce',
    localisation: 'Toulouse 31000',
  },
  {
    id: 'c5',
    trigramme: 'EXC',
    raison_sociale: 'Excellence Formation',
    siret: '856 789 012 00090',
    adresse: '5 Place Bellecour',
    localisation: 'Nantes 44000',
  },
];

// ============================================================
// PROJECTS
// ============================================================
export const MOCK_PROJETS: MockProjet[] = [
  {
    id: 'p1',
    ref: '0042-DUP-APP',
    client: MOCK_CLIENTS[0],
    typologie: { code: 'APP', libelle: 'Apprentissage' },
    cdp: MOCK_USERS[1],
    backup_cdp: MOCK_USERS[2],
    statut: 'actif',
    date_debut: '2025-09-01',
    taux_commission: 10,
    apprentis_actifs: 42,
    taches_a_realiser: 5,
    factures_en_retard: 2,
    encaissements_en_retard: 3200,
    temps_mois_courant: 32,
  },
  {
    id: 'p2',
    ref: '0043-TEC-POE',
    client: MOCK_CLIENTS[1],
    typologie: { code: 'POE', libelle: 'POEI' },
    cdp: MOCK_USERS[2],
    backup_cdp: MOCK_USERS[3],
    statut: 'actif',
    date_debut: '2025-10-15',
    taux_commission: 8,
    apprentis_actifs: 18,
    taches_a_realiser: 12,
    factures_en_retard: 0,
    encaissements_en_retard: 0,
    temps_mois_courant: 24,
  },
  {
    id: 'p3',
    ref: '0044-FOR-APP',
    client: MOCK_CLIENTS[2],
    typologie: { code: 'APP', libelle: 'Apprentissage' },
    cdp: MOCK_USERS[1],
    backup_cdp: null,
    statut: 'actif',
    date_debut: '2026-01-06',
    taux_commission: 10,
    apprentis_actifs: 35,
    taches_a_realiser: 3,
    factures_en_retard: 1,
    encaissements_en_retard: 1500,
    temps_mois_courant: 28,
  },
  {
    id: 'p4',
    ref: '0045-ACA-PDC',
    client: MOCK_CLIENTS[3],
    typologie: {
      code: 'PDC',
      libelle: 'Plan de Developpement des Competences',
    },
    cdp: MOCK_USERS[3],
    backup_cdp: MOCK_USERS[1],
    statut: 'en_pause',
    date_debut: '2025-06-01',
    taux_commission: 12,
    apprentis_actifs: 8,
    taches_a_realiser: 0,
    factures_en_retard: 0,
    encaissements_en_retard: 0,
    temps_mois_courant: 0,
  },
  {
    id: 'p5',
    ref: '0046-EXC-APP',
    client: MOCK_CLIENTS[4],
    typologie: { code: 'APP', libelle: 'Apprentissage' },
    cdp: MOCK_USERS[2],
    backup_cdp: MOCK_USERS[3],
    statut: 'actif',
    date_debut: '2026-02-01',
    taux_commission: 10,
    apprentis_actifs: 55,
    taches_a_realiser: 8,
    factures_en_retard: 3,
    encaissements_en_retard: 4800,
    temps_mois_courant: 35,
  },
  {
    id: 'p6',
    ref: '0038-DUP-POE',
    client: MOCK_CLIENTS[0],
    typologie: { code: 'POE', libelle: 'POEI' },
    cdp: MOCK_USERS[3],
    backup_cdp: null,
    statut: 'termine',
    date_debut: '2024-09-01',
    taux_commission: 10,
    apprentis_actifs: 0,
    taches_a_realiser: 0,
    factures_en_retard: 0,
    encaissements_en_retard: 0,
    temps_mois_courant: 0,
  },
  {
    id: 'p7',
    ref: '0035-TEC-APP',
    client: MOCK_CLIENTS[1],
    typologie: { code: 'APP', libelle: 'Apprentissage' },
    cdp: MOCK_USERS[1],
    backup_cdp: MOCK_USERS[2],
    statut: 'archive',
    date_debut: '2023-09-01',
    taux_commission: 8,
    apprentis_actifs: 0,
    taches_a_realiser: 0,
    factures_en_retard: 0,
    encaissements_en_retard: 0,
    temps_mois_courant: 0,
  },
];

// ============================================================
// CONTRACTS (for project detail)
// ============================================================
export const MOCK_CONTRATS: MockContrat[] = [
  {
    id: 'ct1',
    ref: 'CTR-00187',
    projet_id: 'p1',
    apprenant_nom: 'Lefevre',
    apprenant_prenom: 'Antoine',
    formation_titre: 'BTS Commerce International',
    date_debut: '2025-09-01',
    date_fin: '2027-06-30',
    contract_state: 'actif',
    montant_prise_en_charge: 8500,
    progression_reelle: 45,
    progression_theorique: 40,
  },
  {
    id: 'ct2',
    ref: 'CTR-00188',
    projet_id: 'p1',
    apprenant_nom: 'Moreau',
    apprenant_prenom: 'Julie',
    formation_titre: 'BTS Commerce International',
    date_debut: '2025-09-01',
    date_fin: '2027-06-30',
    contract_state: 'actif',
    montant_prise_en_charge: 8500,
    progression_reelle: 38,
    progression_theorique: 40,
  },
  {
    id: 'ct3',
    ref: 'CTR-00189',
    projet_id: 'p1',
    apprenant_nom: 'Garcia',
    apprenant_prenom: 'Lucas',
    formation_titre: 'BTS Gestion PME',
    date_debut: '2025-09-15',
    date_fin: '2027-06-30',
    contract_state: 'actif',
    montant_prise_en_charge: 7800,
    progression_reelle: 42,
    progression_theorique: 38,
  },
  {
    id: 'ct4',
    ref: 'CTR-00190',
    projet_id: 'p1',
    apprenant_nom: 'Bernard',
    apprenant_prenom: 'Emma',
    formation_titre: 'BTS Commerce International',
    date_debut: '2025-09-01',
    date_fin: '2027-06-30',
    contract_state: 'suspendu',
    montant_prise_en_charge: 8500,
    progression_reelle: 20,
    progression_theorique: 40,
  },
  {
    id: 'ct5',
    ref: 'CTR-00191',
    projet_id: 'p1',
    apprenant_nom: 'Petit',
    apprenant_prenom: 'Nathan',
    formation_titre: 'BTS Gestion PME',
    date_debut: '2025-09-15',
    date_fin: '2027-06-30',
    contract_state: 'actif',
    montant_prise_en_charge: 7800,
    progression_reelle: 50,
    progression_theorique: 38,
  },
  {
    id: 'ct6',
    ref: 'CTR-00192',
    projet_id: 'p1',
    apprenant_nom: 'Roux',
    apprenant_prenom: 'Clara',
    formation_titre: 'BTS Commerce International',
    date_debut: '2025-09-01',
    date_fin: '2027-06-30',
    contract_state: 'resilie',
    montant_prise_en_charge: 8500,
    progression_reelle: 15,
    progression_theorique: 40,
  },
  {
    id: 'ct7',
    ref: 'CTR-00210',
    projet_id: 'p2',
    apprenant_nom: 'Dubois',
    apprenant_prenom: 'Leo',
    formation_titre: 'Developpeur Web Fullstack',
    date_debut: '2025-10-15',
    date_fin: '2026-04-15',
    contract_state: 'actif',
    montant_prise_en_charge: 12000,
    progression_reelle: 72,
    progression_theorique: 80,
  },
  {
    id: 'ct8',
    ref: 'CTR-00211',
    projet_id: 'p2',
    apprenant_nom: 'Laurent',
    apprenant_prenom: 'Lea',
    formation_titre: 'Developpeur Web Fullstack',
    date_debut: '2025-10-15',
    date_fin: '2026-04-15',
    contract_state: 'actif',
    montant_prise_en_charge: 12000,
    progression_reelle: 85,
    progression_theorique: 80,
  },
  {
    id: 'ct9',
    ref: 'CTR-00230',
    projet_id: 'p3',
    apprenant_nom: 'Simon',
    apprenant_prenom: 'Camille',
    formation_titre: 'CAP Cuisine',
    date_debut: '2026-01-06',
    date_fin: '2027-12-20',
    contract_state: 'actif',
    montant_prise_en_charge: 6200,
    progression_reelle: 12,
    progression_theorique: 15,
  },
  {
    id: 'ct10',
    ref: 'CTR-00231',
    projet_id: 'p3',
    apprenant_nom: 'Michel',
    apprenant_prenom: 'Hugo',
    formation_titre: 'CAP Cuisine',
    date_debut: '2026-01-06',
    date_fin: '2027-12-20',
    contract_state: 'actif',
    montant_prise_en_charge: 6200,
    progression_reelle: 18,
    progression_theorique: 15,
  },
];

// ============================================================
// PROJECT DETAIL DATA (keyed by project id)
// ============================================================
export const MOCK_FINANCE: Record<string, MockFinanceProjet> = {
  p1: {
    production_opco: 45000,
    facture_opco: 38000,
    encaisse_opco: 32000,
    taux_commission: 10,
  },
  p2: {
    production_opco: 28000,
    facture_opco: 28000,
    encaisse_opco: 28000,
    taux_commission: 8,
  },
  p3: {
    production_opco: 18000,
    facture_opco: 12000,
    encaisse_opco: 10500,
    taux_commission: 10,
  },
  p4: {
    production_opco: 15000,
    facture_opco: 15000,
    encaisse_opco: 15000,
    taux_commission: 12,
  },
  p5: {
    production_opco: 62000,
    facture_opco: 48000,
    encaisse_opco: 43200,
    taux_commission: 10,
  },
};

export const MOCK_TEMPS: Record<string, MockTempsProjet> = {
  p1: {
    total: 32,
    mois_label: 'Avril 2026',
    axes: [
      {
        code: 'accompagnement',
        label: 'Accompagnement',
        heures: 12,
        color: '#16a34a',
      },
      { code: 'pedagogie', label: 'Pédagogie', heures: 8, color: '#059669' },
      {
        code: 'administratif',
        label: 'Administratif',
        heures: 6,
        color: '#0d9488',
      },
      { code: 'qualite', label: 'Qualité', heures: 4, color: '#0891b2' },
      { code: 'commercial', label: 'Commercial', heures: 2, color: '#6366f1' },
    ],
  },
  p2: {
    total: 24,
    mois_label: 'Avril 2026',
    axes: [
      {
        code: 'accompagnement',
        label: 'Accompagnement',
        heures: 10,
        color: '#16a34a',
      },
      { code: 'pedagogie', label: 'Pédagogie', heures: 6, color: '#059669' },
      {
        code: 'administratif',
        label: 'Administratif',
        heures: 4,
        color: '#0d9488',
      },
      { code: 'qualite', label: 'Qualité', heures: 2, color: '#0891b2' },
      { code: 'commercial', label: 'Commercial', heures: 2, color: '#6366f1' },
    ],
  },
  p3: {
    total: 28,
    mois_label: 'Avril 2026',
    axes: [
      {
        code: 'accompagnement',
        label: 'Accompagnement',
        heures: 14,
        color: '#16a34a',
      },
      { code: 'pedagogie', label: 'Pédagogie', heures: 5, color: '#059669' },
      {
        code: 'administratif',
        label: 'Administratif',
        heures: 3,
        color: '#0d9488',
      },
      { code: 'qualite', label: 'Qualité', heures: 4, color: '#0891b2' },
      { code: 'commercial', label: 'Commercial', heures: 2, color: '#6366f1' },
    ],
  },
  p5: {
    total: 35,
    mois_label: 'Avril 2026',
    axes: [
      {
        code: 'accompagnement',
        label: 'Accompagnement',
        heures: 15,
        color: '#16a34a',
      },
      { code: 'pedagogie', label: 'Pédagogie', heures: 9, color: '#059669' },
      {
        code: 'administratif',
        label: 'Administratif',
        heures: 5,
        color: '#0d9488',
      },
      { code: 'qualite', label: 'Qualité', heures: 3, color: '#0891b2' },
      { code: 'commercial', label: 'Commercial', heures: 3, color: '#6366f1' },
    ],
  },
};

export const MOCK_QUALITE: Record<string, MockQualiteProjet> = {
  p1: { terminees: 18, a_realiser: 5 },
  p2: { terminees: 8, a_realiser: 12 },
  p3: { terminees: 22, a_realiser: 3 },
  p4: { terminees: 15, a_realiser: 0 },
  p5: { terminees: 14, a_realiser: 8 },
};

// ============================================================
// CLIENT DETAIL DATA
// ============================================================
export interface MockClientContact {
  id: string;
  client_id: string;
  nom: string;
  poste: string;
  email: string;
  telephone: string;
}

export interface MockClientNote {
  id: string;
  client_id: string;
  user: MockUser;
  contenu: string;
  created_at: string;
}

export interface MockClientDocument {
  id: string;
  client_id: string;
  user: MockUser;
  nom_fichier: string;
  type_document: string;
  created_at: string;
}

export interface MockFactureLigne {
  id: string;
  facture_id: string;
  contrat_ref: string;
  apprenant_nom: string;
  description: string;
  montant_ht: number;
}

export interface MockFacture {
  id: string;
  ref: string;
  projet_id: string;
  projet_ref: string;
  client_id: string;
  client_trigramme: string;
  client_raison_sociale: string;
  date_emission: string;
  date_echeance: string;
  mois_concerne: string;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  statut: 'a_emettre' | 'emise' | 'payee' | 'en_retard' | 'avoir';
  est_avoir: boolean;
  avoir_motif: string | null;
  facture_origine_ref: string | null;
  lignes: MockFactureLigne[];
  created_by: string;
}

export interface MockPaiement {
  id: string;
  facture_id: string;
  montant: number;
  date_reception: string;
  saisie_manuelle: boolean;
}

export interface MockEcheance {
  id: string;
  projet_id: string;
  projet_ref: string;
  client_trigramme: string;
  client_raison_sociale: string;
  mois_concerne: string;
  date_emission_prevue: string;
  montant_prevu_ht: number;
  nb_contrats: number;
  facture_id: string | null;
  validee: boolean;
}

export const MOCK_CLIENT_CONTACTS: MockClientContact[] = [
  {
    id: 'cc1',
    client_id: 'c1',
    nom: 'Jean Dupont',
    poste: 'Directeur',
    email: 'j.dupont@dupont-formation.fr',
    telephone: '01 23 45 67 89',
  },
  {
    id: 'cc2',
    client_id: 'c1',
    nom: 'Marie Legrand',
    poste: 'Referent pedagogique',
    email: 'm.legrand@dupont-formation.fr',
    telephone: '01 23 45 67 90',
  },
  {
    id: 'cc3',
    client_id: 'c2',
    nom: 'Pierre Techman',
    poste: 'Directeur technique',
    email: 'p.techman@techform.fr',
    telephone: '04 56 78 90 12',
  },
  {
    id: 'cc4',
    client_id: 'c3',
    nom: 'Sophie Forma',
    poste: 'Responsable formation',
    email: 's.forma@formapro.com',
    telephone: '04 91 23 45 67',
  },
  {
    id: 'cc5',
    client_id: 'c4',
    nom: 'Luc Numeris',
    poste: 'Directeur general',
    email: 'l.numeris@academie-num.fr',
    telephone: '05 61 23 45 67',
  },
  {
    id: 'cc6',
    client_id: 'c5',
    nom: 'Anne Excellence',
    poste: 'Directrice',
    email: 'a.excellence@excel-formation.fr',
    telephone: '02 40 12 34 56',
  },
];

export const MOCK_CLIENT_NOTES: MockClientNote[] = [
  {
    id: 'cn1',
    client_id: 'c1',
    user: MOCK_USERS[1],
    contenu:
      'Réunion de lancement effectuée. Le client souhaite démarrer avec 42 apprentis pour la rentrée 2025.',
    created_at: '2025-07-15T10:30:00Z',
  },
  {
    id: 'cn2',
    client_id: 'c1',
    user: MOCK_USERS[0],
    contenu:
      'Clé API Eduvia configurée et testée avec succès. Synchronisation initiale des contrats effectuée.',
    created_at: '2025-08-02T14:00:00Z',
  },
  {
    id: 'cn3',
    client_id: 'c1',
    user: MOCK_USERS[1],
    contenu:
      'Point mensuel : 2 contrats résiliés (Emma Bernard, Clara Roux). Le client demande un suivi renforcé sur les apprenants en difficulté.',
    created_at: '2026-02-10T09:15:00Z',
  },
  {
    id: 'cn4',
    client_id: 'c2',
    user: MOCK_USERS[2],
    contenu:
      'Nouveau projet POEI demarre. 18 apprenants en Developpeur Web Fullstack.',
    created_at: '2025-10-20T11:00:00Z',
  },
  {
    id: 'cn5',
    client_id: 'c3',
    user: MOCK_USERS[1],
    contenu:
      "Client tres satisfait de l'accompagnement. Envisage un 2e projet pour septembre 2026.",
    created_at: '2026-03-05T16:30:00Z',
  },
];

export const MOCK_CLIENT_DOCUMENTS: MockClientDocument[] = [
  {
    id: 'cd1',
    client_id: 'c1',
    user: MOCK_USERS[0],
    nom_fichier: 'Convention_Dupont_2025.pdf',
    type_document: 'Convention',
    created_at: '2025-07-10T08:00:00Z',
  },
  {
    id: 'cd2',
    client_id: 'c1',
    user: MOCK_USERS[1],
    nom_fichier: 'Avenant_tarifs_2026.pdf',
    type_document: 'Avenant',
    created_at: '2026-01-15T09:30:00Z',
  },
  {
    id: 'cd3',
    client_id: 'c2',
    user: MOCK_USERS[2],
    nom_fichier: 'Contrat_TechForm_POEI.pdf',
    type_document: 'Contrat signe',
    created_at: '2025-10-01T10:00:00Z',
  },
  {
    id: 'cd4',
    client_id: 'c3',
    user: MOCK_USERS[1],
    nom_fichier: 'Attestation_Qualiopi_FormaPro.pdf',
    type_document: 'Attestation',
    created_at: '2025-12-20T14:00:00Z',
  },
];

// ============================================================
// QUALITE DETAIL (per project, per family)
// ============================================================
export interface MockTacheQualite {
  id: string;
  projet_id: string;
  famille_code: string;
  famille_libelle: string;
  livrable: string;
  fait: boolean;
}

export const FAMILLES_QUALITE = [
  { code: 'C1', libelle: 'Information au public', nb_livrables: 1 },
  { code: 'C2', libelle: 'Objectif et adaptation', nb_livrables: 8 },
  { code: 'C3', libelle: 'Accueil, suivi et evaluation', nb_livrables: 26 },
  { code: 'C4', libelle: 'Adequation des moyens', nb_livrables: 11 },
  { code: 'C5', libelle: 'Qualification du personnel', nb_livrables: 7 },
  { code: 'C6', libelle: 'Investissement environnement pro', nb_livrables: 18 },
  { code: 'C7', libelle: 'Appréciations et amélioration', nb_livrables: 12 },
  { code: 'ADM', libelle: 'Administration & Organisation', nb_livrables: 20 },
  { code: 'HQ', libelle: 'Handicap & Qualité Transversale', nb_livrables: 1 },
  { code: 'RGPD', libelle: 'Protection des Données', nb_livrables: 5 },
];

function generateTaches(
  projetId: string,
  doneRate: number,
): MockTacheQualite[] {
  const taches: MockTacheQualite[] = [];
  let idx = 0;
  for (const famille of FAMILLES_QUALITE) {
    for (let i = 0; i < famille.nb_livrables; i++) {
      idx++;
      // Deterministic: mark first N livrables as done based on doneRate
      const doneCount = Math.round(famille.nb_livrables * doneRate);
      taches.push({
        id: `tq-${projetId}-${idx}`,
        projet_id: projetId,
        famille_code: famille.code,
        famille_libelle: famille.libelle,
        livrable: `Livrable ${famille.code}-${i + 1}`,
        fait: i < doneCount,
      });
    }
  }
  return taches;
}

export const MOCK_TACHES_QUALITE: MockTacheQualite[] = [
  ...generateTaches('p1', 0.78),
  ...generateTaches('p2', 0.4),
  ...generateTaches('p3', 0.92),
  ...generateTaches('p4', 1.0),
  ...generateTaches('p5', 0.63),
];

export function getTachesByProjetId(projetId: string): MockTacheQualite[] {
  return MOCK_TACHES_QUALITE.filter((t) => t.projet_id === projetId);
}

export interface QualiteProjetSummary {
  projet: MockProjet;
  total: number;
  terminees: number;
  a_realiser: number;
  pct: number;
}

export function getQualiteSummaries(): QualiteProjetSummary[] {
  return MOCK_PROJETS.filter(
    (p) => p.statut === 'actif' || p.statut === 'en_pause',
  ).map((p) => {
    const taches = getTachesByProjetId(p.id);
    const terminees = taches.filter((t) => t.fait).length;
    return {
      projet: p,
      total: taches.length,
      terminees,
      a_realiser: taches.length - terminees,
      pct:
        taches.length > 0 ? Math.round((terminees / taches.length) * 100) : 0,
    };
  });
}

// ============================================================
// TIME TRACKING (weekly grid)
// ============================================================
export interface MockSaisieTemps {
  projet_id: string;
  projet_ref: string;
  projet_label: string;
  est_absence: boolean;
  absence_type?: 'conges' | 'maladie' | 'ferie';
  // Keyed by ISO date string (YYYY-MM-DD)
  heures: Record<string, number>;
  // Axes per day: Record<date, Record<axe_code, heures>>
  axes: Record<string, Record<string, number>>;
}

export function getMockWeekDates(weekOffset: number = 0): string[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(
    today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + weekOffset * 7,
  );

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function getMockSaisiesForWeek(weekDates: string[]): MockSaisieTemps[] {
  const weekdays = weekDates.slice(0, 5); // Mon-Fri only

  return [
    {
      projet_id: 'p1',
      projet_ref: '0042-DUP-APP',
      projet_label: 'Dupont Formation - Apprentissage',
      est_absence: false,
      heures: Object.fromEntries(
        weekdays.map((d, i) => [d, [3, 2.5, 3, 2, 2.5][i]]),
      ),
      axes: Object.fromEntries(
        weekdays.map((d, i) => [
          d,
          {
            accompagnement: [1.5, 1, 1.5, 1, 1][i],
            pedagogie: [0.5, 0.5, 0.5, 0.5, 0.5][i],
            administratif: [0.5, 0.5, 0.5, 0.25, 0.5][i],
            qualite: [0.25, 0.25, 0.25, 0.25, 0.25][i],
            commercial: [0.25, 0.25, 0.25, 0, 0.25][i],
          },
        ]),
      ),
    },
    {
      projet_id: 'p3',
      projet_ref: '0044-FOR-APP',
      projet_label: 'FormaPro - Apprentissage',
      est_absence: false,
      heures: Object.fromEntries(
        weekdays.map((d, i) => [d, [2.5, 3, 2, 3.5, 2.5][i]]),
      ),
      axes: Object.fromEntries(
        weekdays.map((d, i) => [
          d,
          {
            accompagnement: [1, 1.5, 1, 2, 1][i],
            pedagogie: [0.5, 0.5, 0.5, 0.5, 0.5][i],
            administratif: [0.5, 0.5, 0.25, 0.5, 0.5][i],
            qualite: [0.25, 0.25, 0.25, 0.25, 0.25][i],
            commercial: [0.25, 0.25, 0, 0.25, 0.25][i],
          },
        ]),
      ),
    },
    {
      projet_id: 'p5',
      projet_ref: '0046-EXC-APP',
      projet_label: 'Excellence Formation - Apprentissage',
      est_absence: false,
      heures: Object.fromEntries(
        weekdays.map((d, i) => [d, [1.5, 1.5, 2, 1.5, 1][i]]),
      ),
      axes: Object.fromEntries(
        weekdays.map((d, i) => [
          d,
          {
            accompagnement: [0.5, 0.5, 1, 0.5, 0.5][i],
            pedagogie: [0.5, 0.5, 0.5, 0.5, 0.25][i],
            administratif: [0.25, 0.25, 0.25, 0.25, 0.25][i],
            qualite: [0.25, 0.25, 0.25, 0.25, 0][i],
            commercial: [0, 0, 0, 0, 0][i],
          },
        ]),
      ),
    },
    {
      projet_id: 'abs-conges',
      projet_ref: '9999-CON-ABS',
      projet_label: 'Conges payes',
      est_absence: true,
      absence_type: 'conges',
      heures: {},
      axes: {},
    },
    {
      projet_id: 'abs-maladie',
      projet_ref: '9998-MAL-ABS',
      projet_label: 'Arret maladie',
      est_absence: true,
      absence_type: 'maladie',
      heures: {},
      axes: {},
    },
    {
      projet_id: 'abs-ferie',
      projet_ref: '9997-FER-ABS',
      projet_label: 'Jour ferie',
      est_absence: true,
      absence_type: 'ferie',
      heures: {},
      axes: {},
    },
  ];
}

// ============================================================
// FACTURATION
// ============================================================
export const MOCK_FACTURES: MockFacture[] = [
  {
    id: 'fac1',
    ref: 'FAC-DUP-0001',
    projet_id: 'p1',
    projet_ref: '0042-DUP-APP',
    client_id: 'c1',
    client_trigramme: 'DUP',
    client_raison_sociale: 'Dupont Formation SAS',
    date_emission: '2026-01-28',
    date_echeance: '2026-02-28',
    mois_concerne: 'Janvier 2026',
    montant_ht: 4500,
    taux_tva: 20,
    montant_tva: 900,
    montant_ttc: 5400,
    statut: 'payee',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_ref: null,
    lignes: [
      {
        id: 'fl1',
        facture_id: 'fac1',
        contrat_ref: 'CTR-00187',
        apprenant_nom: 'Lefevre Antoine',
        description: 'Commission Janvier 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
      {
        id: 'fl2',
        facture_id: 'fac1',
        contrat_ref: 'CTR-00188',
        apprenant_nom: 'Moreau Julie',
        description: 'Commission Janvier 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
      {
        id: 'fl3',
        facture_id: 'fac1',
        contrat_ref: 'CTR-00189',
        apprenant_nom: 'Garcia Lucas',
        description: 'Commission Janvier 2026 - BTS Gestion PME',
        montant_ht: 65.0,
      },
      {
        id: 'fl4',
        facture_id: 'fac1',
        contrat_ref: 'CTR-00190',
        apprenant_nom: 'Bernard Emma',
        description: 'Commission Janvier 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
      {
        id: 'fl5',
        facture_id: 'fac1',
        contrat_ref: 'CTR-00191',
        apprenant_nom: 'Petit Nathan',
        description: 'Commission Janvier 2026 - BTS Gestion PME',
        montant_ht: 65.0,
      },
      {
        id: 'fl6',
        facture_id: 'fac1',
        contrat_ref: 'CTR-00192',
        apprenant_nom: 'Roux Clara',
        description: 'Commission Janvier 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
    ],
    created_by: 'u2',
  },
  {
    id: 'fac2',
    ref: 'FAC-DUP-0002',
    projet_id: 'p1',
    projet_ref: '0042-DUP-APP',
    client_id: 'c1',
    client_trigramme: 'DUP',
    client_raison_sociale: 'Dupont Formation SAS',
    date_emission: '2026-02-28',
    date_echeance: '2026-03-31',
    mois_concerne: 'Février 2026',
    montant_ht: 4500,
    taux_tva: 20,
    montant_tva: 900,
    montant_ttc: 5400,
    statut: 'payee',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_ref: null,
    lignes: [
      {
        id: 'fl7',
        facture_id: 'fac2',
        contrat_ref: 'CTR-00187',
        apprenant_nom: 'Lefevre Antoine',
        description: 'Commission Février 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
      {
        id: 'fl8',
        facture_id: 'fac2',
        contrat_ref: 'CTR-00188',
        apprenant_nom: 'Moreau Julie',
        description: 'Commission Février 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
      {
        id: 'fl9',
        facture_id: 'fac2',
        contrat_ref: 'CTR-00189',
        apprenant_nom: 'Garcia Lucas',
        description: 'Commission Février 2026 - BTS Gestion PME',
        montant_ht: 65.0,
      },
      {
        id: 'fl10',
        facture_id: 'fac2',
        contrat_ref: 'CTR-00190',
        apprenant_nom: 'Bernard Emma',
        description: 'Commission Février 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
      {
        id: 'fl11',
        facture_id: 'fac2',
        contrat_ref: 'CTR-00191',
        apprenant_nom: 'Petit Nathan',
        description: 'Commission Février 2026 - BTS Gestion PME',
        montant_ht: 65.0,
      },
      {
        id: 'fl12',
        facture_id: 'fac2',
        contrat_ref: 'CTR-00192',
        apprenant_nom: 'Roux Clara',
        description: 'Commission Février 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
    ],
    created_by: 'u2',
  },
  {
    id: 'fac3',
    ref: 'FAC-DUP-0003',
    projet_id: 'p1',
    projet_ref: '0042-DUP-APP',
    client_id: 'c1',
    client_trigramme: 'DUP',
    client_raison_sociale: 'Dupont Formation SAS',
    date_emission: '2026-03-28',
    date_echeance: '2026-04-30',
    mois_concerne: 'Mars 2026',
    montant_ht: 4500,
    taux_tva: 20,
    montant_tva: 900,
    montant_ttc: 5400,
    statut: 'emise',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_ref: null,
    lignes: [
      {
        id: 'fl13',
        facture_id: 'fac3',
        contrat_ref: 'CTR-00187',
        apprenant_nom: 'Lefevre Antoine',
        description: 'Commission Mars 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
      {
        id: 'fl14',
        facture_id: 'fac3',
        contrat_ref: 'CTR-00188',
        apprenant_nom: 'Moreau Julie',
        description: 'Commission Mars 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
      {
        id: 'fl15',
        facture_id: 'fac3',
        contrat_ref: 'CTR-00189',
        apprenant_nom: 'Garcia Lucas',
        description: 'Commission Mars 2026 - BTS Gestion PME',
        montant_ht: 65.0,
      },
      {
        id: 'fl16',
        facture_id: 'fac3',
        contrat_ref: 'CTR-00190',
        apprenant_nom: 'Bernard Emma',
        description: 'Commission Mars 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
      {
        id: 'fl17',
        facture_id: 'fac3',
        contrat_ref: 'CTR-00191',
        apprenant_nom: 'Petit Nathan',
        description: 'Commission Mars 2026 - BTS Gestion PME',
        montant_ht: 65.0,
      },
      {
        id: 'fl18',
        facture_id: 'fac3',
        contrat_ref: 'CTR-00192',
        apprenant_nom: 'Roux Clara',
        description: 'Commission Mars 2026 - BTS Commerce International',
        montant_ht: 70.83,
      },
    ],
    created_by: 'u2',
  },
  {
    id: 'fac4',
    ref: 'FAC-DUP-0004',
    projet_id: 'p1',
    projet_ref: '0042-DUP-APP',
    client_id: 'c1',
    client_trigramme: 'DUP',
    client_raison_sociale: 'Dupont Formation SAS',
    date_emission: '2026-04-02',
    date_echeance: '2026-04-30',
    mois_concerne: 'Avril 2026',
    montant_ht: -4500,
    taux_tva: 20,
    montant_tva: -900,
    montant_ttc: -5400,
    statut: 'avoir',
    est_avoir: true,
    avoir_motif: 'Erreur de facturation',
    facture_origine_ref: 'FAC-DUP-0003',
    lignes: [
      {
        id: 'fl19',
        facture_id: 'fac4',
        contrat_ref: 'CTR-00187',
        apprenant_nom: 'Lefevre Antoine',
        description: 'Avoir sur FAC-DUP-0003 - BTS Commerce International',
        montant_ht: -70.83,
      },
      {
        id: 'fl20',
        facture_id: 'fac4',
        contrat_ref: 'CTR-00188',
        apprenant_nom: 'Moreau Julie',
        description: 'Avoir sur FAC-DUP-0003 - BTS Commerce International',
        montant_ht: -70.83,
      },
      {
        id: 'fl21',
        facture_id: 'fac4',
        contrat_ref: 'CTR-00189',
        apprenant_nom: 'Garcia Lucas',
        description: 'Avoir sur FAC-DUP-0003 - BTS Gestion PME',
        montant_ht: -65.0,
      },
      {
        id: 'fl22',
        facture_id: 'fac4',
        contrat_ref: 'CTR-00190',
        apprenant_nom: 'Bernard Emma',
        description: 'Avoir sur FAC-DUP-0003 - BTS Commerce International',
        montant_ht: -70.83,
      },
      {
        id: 'fl23',
        facture_id: 'fac4',
        contrat_ref: 'CTR-00191',
        apprenant_nom: 'Petit Nathan',
        description: 'Avoir sur FAC-DUP-0003 - BTS Gestion PME',
        montant_ht: -65.0,
      },
      {
        id: 'fl24',
        facture_id: 'fac4',
        contrat_ref: 'CTR-00192',
        apprenant_nom: 'Roux Clara',
        description: 'Avoir sur FAC-DUP-0003 - BTS Commerce International',
        montant_ht: -70.83,
      },
    ],
    created_by: 'u2',
  },
  {
    id: 'fac5',
    ref: 'FAC-TEC-0005',
    projet_id: 'p2',
    projet_ref: '0043-TEC-POE',
    client_id: 'c2',
    client_trigramme: 'TEC',
    client_raison_sociale: 'TechForm Academy',
    date_emission: '2026-01-28',
    date_echeance: '2026-02-28',
    mois_concerne: 'Janvier 2026',
    montant_ht: 1600,
    taux_tva: 20,
    montant_tva: 320,
    montant_ttc: 1920,
    statut: 'payee',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_ref: null,
    lignes: [
      {
        id: 'fl25',
        facture_id: 'fac5',
        contrat_ref: 'CTR-00210',
        apprenant_nom: 'Dubois Leo',
        description: 'Commission Janvier 2026 - Developpeur Web Fullstack',
        montant_ht: 80.0,
      },
      {
        id: 'fl26',
        facture_id: 'fac5',
        contrat_ref: 'CTR-00211',
        apprenant_nom: 'Laurent Lea',
        description: 'Commission Janvier 2026 - Developpeur Web Fullstack',
        montant_ht: 80.0,
      },
    ],
    created_by: 'u3',
  },
  {
    id: 'fac6',
    ref: 'FAC-TEC-0006',
    projet_id: 'p2',
    projet_ref: '0043-TEC-POE',
    client_id: 'c2',
    client_trigramme: 'TEC',
    client_raison_sociale: 'TechForm Academy',
    date_emission: '2026-02-28',
    date_echeance: '2026-03-31',
    mois_concerne: 'Février 2026',
    montant_ht: 1600,
    taux_tva: 20,
    montant_tva: 320,
    montant_ttc: 1920,
    statut: 'en_retard',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_ref: null,
    lignes: [
      {
        id: 'fl27',
        facture_id: 'fac6',
        contrat_ref: 'CTR-00210',
        apprenant_nom: 'Dubois Leo',
        description: 'Commission Février 2026 - Developpeur Web Fullstack',
        montant_ht: 80.0,
      },
      {
        id: 'fl28',
        facture_id: 'fac6',
        contrat_ref: 'CTR-00211',
        apprenant_nom: 'Laurent Lea',
        description: 'Commission Février 2026 - Developpeur Web Fullstack',
        montant_ht: 80.0,
      },
    ],
    created_by: 'u3',
  },
  {
    id: 'fac7',
    ref: 'FAC-FOR-0007',
    projet_id: 'p3',
    projet_ref: '0044-FOR-APP',
    client_id: 'c3',
    client_trigramme: 'FOR',
    client_raison_sociale: 'FormaPro International',
    date_emission: '2026-03-28',
    date_echeance: '2026-04-30',
    mois_concerne: 'Mars 2026',
    montant_ht: 1033,
    taux_tva: 20,
    montant_tva: 206.6,
    montant_ttc: 1239.6,
    statut: 'emise',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_ref: null,
    lignes: [
      {
        id: 'fl29',
        facture_id: 'fac7',
        contrat_ref: 'CTR-00230',
        apprenant_nom: 'Simon Camille',
        description: 'Commission Mars 2026 - CAP Cuisine',
        montant_ht: 51.67,
      },
      {
        id: 'fl30',
        facture_id: 'fac7',
        contrat_ref: 'CTR-00231',
        apprenant_nom: 'Michel Hugo',
        description: 'Commission Mars 2026 - CAP Cuisine',
        montant_ht: 51.67,
      },
    ],
    created_by: 'u2',
  },
  {
    id: 'fac8',
    ref: 'FAC-FOR-0008',
    projet_id: 'p3',
    projet_ref: '0044-FOR-APP',
    client_id: 'c3',
    client_trigramme: 'FOR',
    client_raison_sociale: 'FormaPro International',
    date_emission: '2026-02-28',
    date_echeance: '2026-03-31',
    mois_concerne: 'Février 2026',
    montant_ht: 1033,
    taux_tva: 20,
    montant_tva: 206.6,
    montant_ttc: 1239.6,
    statut: 'en_retard',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_ref: null,
    lignes: [
      {
        id: 'fl31',
        facture_id: 'fac8',
        contrat_ref: 'CTR-00230',
        apprenant_nom: 'Simon Camille',
        description: 'Commission Février 2026 - CAP Cuisine',
        montant_ht: 51.67,
      },
      {
        id: 'fl32',
        facture_id: 'fac8',
        contrat_ref: 'CTR-00231',
        apprenant_nom: 'Michel Hugo',
        description: 'Commission Février 2026 - CAP Cuisine',
        montant_ht: 51.67,
      },
    ],
    created_by: 'u2',
  },
  {
    id: 'fac9',
    ref: 'FAC-EXC-0009',
    projet_id: 'p5',
    projet_ref: '0046-EXC-APP',
    client_id: 'c5',
    client_trigramme: 'EXC',
    client_raison_sociale: 'Excellence Formation',
    date_emission: '2026-03-28',
    date_echeance: '2026-04-30',
    mois_concerne: 'Mars 2026',
    montant_ht: 2500,
    taux_tva: 20,
    montant_tva: 500,
    montant_ttc: 3000,
    statut: 'a_emettre',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_ref: null,
    lignes: [
      {
        id: 'fl33',
        facture_id: 'fac9',
        contrat_ref: 'CTR-00250',
        apprenant_nom: 'Dupuis Manon',
        description: 'Commission Mars 2026 - BTS Management Commercial',
        montant_ht: 83.33,
      },
      {
        id: 'fl34',
        facture_id: 'fac9',
        contrat_ref: 'CTR-00251',
        apprenant_nom: 'Renard Paul',
        description: 'Commission Mars 2026 - BTS Management Commercial',
        montant_ht: 83.33,
      },
      {
        id: 'fl35',
        facture_id: 'fac9',
        contrat_ref: 'CTR-00252',
        apprenant_nom: 'Blanchard Ines',
        description: 'Commission Mars 2026 - BTS Comptabilite Gestion',
        montant_ht: 83.33,
      },
    ],
    created_by: 'u2',
  },
  {
    id: 'fac10',
    ref: 'FAC-EXC-0010',
    projet_id: 'p5',
    projet_ref: '0046-EXC-APP',
    client_id: 'c5',
    client_trigramme: 'EXC',
    client_raison_sociale: 'Excellence Formation',
    date_emission: '2026-02-28',
    date_echeance: '2026-03-31',
    mois_concerne: 'Février 2026',
    montant_ht: 2500,
    taux_tva: 20,
    montant_tva: 500,
    montant_ttc: 3000,
    statut: 'emise',
    est_avoir: false,
    avoir_motif: null,
    facture_origine_ref: null,
    lignes: [
      {
        id: 'fl36',
        facture_id: 'fac10',
        contrat_ref: 'CTR-00250',
        apprenant_nom: 'Dupuis Manon',
        description: 'Commission Février 2026 - BTS Management Commercial',
        montant_ht: 83.33,
      },
      {
        id: 'fl37',
        facture_id: 'fac10',
        contrat_ref: 'CTR-00251',
        apprenant_nom: 'Renard Paul',
        description: 'Commission Février 2026 - BTS Management Commercial',
        montant_ht: 83.33,
      },
      {
        id: 'fl38',
        facture_id: 'fac10',
        contrat_ref: 'CTR-00252',
        apprenant_nom: 'Blanchard Ines',
        description: 'Commission Février 2026 - BTS Comptabilite Gestion',
        montant_ht: 83.33,
      },
    ],
    created_by: 'u2',
  },
];

export const MOCK_PAIEMENTS: MockPaiement[] = [
  {
    id: 'pay1',
    facture_id: 'fac1',
    montant: 5400,
    date_reception: '2026-02-25',
    saisie_manuelle: false,
  },
  {
    id: 'pay2',
    facture_id: 'fac2',
    montant: 5400,
    date_reception: '2026-03-28',
    saisie_manuelle: false,
  },
  {
    id: 'pay3',
    facture_id: 'fac5',
    montant: 1920,
    date_reception: '2026-02-20',
    saisie_manuelle: false,
  },
];

export const MOCK_ECHEANCES: MockEcheance[] = [
  {
    id: 'ech1',
    projet_id: 'p1',
    projet_ref: '0042-DUP-APP',
    client_trigramme: 'DUP',
    client_raison_sociale: 'Dupont Formation SAS',
    mois_concerne: 'Mai 2026',
    date_emission_prevue: '2026-05-28',
    montant_prevu_ht: 4500,
    nb_contrats: 6,
    facture_id: null,
    validee: false,
  },
  {
    id: 'ech2',
    projet_id: 'p2',
    projet_ref: '0043-TEC-POE',
    client_trigramme: 'TEC',
    client_raison_sociale: 'TechForm Academy',
    mois_concerne: 'Mars 2026',
    date_emission_prevue: '2026-03-28',
    montant_prevu_ht: 1600,
    nb_contrats: 2,
    facture_id: null,
    validee: false,
  },
  {
    id: 'ech3',
    projet_id: 'p3',
    projet_ref: '0044-FOR-APP',
    client_trigramme: 'FOR',
    client_raison_sociale: 'FormaPro International',
    mois_concerne: 'Avril 2026',
    date_emission_prevue: '2026-04-28',
    montant_prevu_ht: 1033,
    nb_contrats: 2,
    facture_id: null,
    validee: false,
  },
  {
    id: 'ech4',
    projet_id: 'p5',
    projet_ref: '0046-EXC-APP',
    client_trigramme: 'EXC',
    client_raison_sociale: 'Excellence Formation',
    mois_concerne: 'Avril 2026',
    date_emission_prevue: '2026-04-28',
    montant_prevu_ht: 2500,
    nb_contrats: 3,
    facture_id: null,
    validee: false,
  },
];

// ============================================================
// HELPERS
// ============================================================
export function getProjetByRef(ref: string): MockProjet | undefined {
  return MOCK_PROJETS.find((p) => p.ref === ref);
}

export function getContratsByProjetId(projetId: string): MockContrat[] {
  return MOCK_CONTRATS.filter((c) => c.projet_id === projetId);
}

export function getClientById(id: string): MockClient | undefined {
  return MOCK_CLIENTS.find((c) => c.id === id);
}

export function getProjetsByClientId(clientId: string): MockProjet[] {
  return MOCK_PROJETS.filter((p) => p.client.id === clientId);
}

export function getContactsByClientId(clientId: string): MockClientContact[] {
  return MOCK_CLIENT_CONTACTS.filter((c) => c.client_id === clientId);
}

export function getNotesByClientId(clientId: string): MockClientNote[] {
  return MOCK_CLIENT_NOTES.filter((n) => n.client_id === clientId).sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getDocumentsByClientId(clientId: string): MockClientDocument[] {
  return MOCK_CLIENT_DOCUMENTS.filter((d) => d.client_id === clientId);
}

export function getFactures(): MockFacture[] {
  return MOCK_FACTURES;
}

export function getFactureByRef(ref: string): MockFacture | undefined {
  return MOCK_FACTURES.find((f) => f.ref === ref);
}

export function getPaiementsByFactureId(factureId: string): MockPaiement[] {
  return MOCK_PAIEMENTS.filter((p) => p.facture_id === factureId);
}

export function getEcheancesPending(): MockEcheance[] {
  return MOCK_ECHEANCES.filter((e) => !e.facture_id && !e.validee);
}

// ============================================================
// USERS - list view
// ============================================================
export interface UserListRow {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: 'admin' | 'cdp';
  actif: boolean;
  derniere_connexion: string | null;
  nb_projets: number;
}

export function getUserListData(): UserListRow[] {
  return MOCK_USERS.map((u) => ({
    ...u,
    actif: true,
    derniere_connexion:
      u.id === 'u1'
        ? '2026-04-08T14:32:00Z'
        : u.id === 'u2'
          ? '2026-04-08T09:15:00Z'
          : u.id === 'u3'
            ? '2026-04-07T17:45:00Z'
            : '2026-04-05T11:00:00Z',
    nb_projets: MOCK_PROJETS.filter(
      (p) => p.cdp.id === u.id || p.backup_cdp?.id === u.id,
    ).length,
  }));
}

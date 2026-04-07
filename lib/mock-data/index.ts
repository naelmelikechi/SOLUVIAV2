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
      { code: 'pedagogie', label: 'Pedagogie', heures: 8, color: '#059669' },
      {
        code: 'administratif',
        label: 'Administratif',
        heures: 6,
        color: '#0d9488',
      },
      { code: 'qualite', label: 'Qualite', heures: 4, color: '#0891b2' },
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
      { code: 'pedagogie', label: 'Pedagogie', heures: 6, color: '#059669' },
      {
        code: 'administratif',
        label: 'Administratif',
        heures: 4,
        color: '#0d9488',
      },
      { code: 'qualite', label: 'Qualite', heures: 2, color: '#0891b2' },
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
      { code: 'pedagogie', label: 'Pedagogie', heures: 5, color: '#059669' },
      {
        code: 'administratif',
        label: 'Administratif',
        heures: 3,
        color: '#0d9488',
      },
      { code: 'qualite', label: 'Qualite', heures: 4, color: '#0891b2' },
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
      { code: 'pedagogie', label: 'Pedagogie', heures: 9, color: '#059669' },
      {
        code: 'administratif',
        label: 'Administratif',
        heures: 5,
        color: '#0d9488',
      },
      { code: 'qualite', label: 'Qualite', heures: 3, color: '#0891b2' },
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

// Helper to get project data by ref
export function getProjetByRef(ref: string): MockProjet | undefined {
  return MOCK_PROJETS.find((p) => p.ref === ref);
}

export function getContratsByProjetId(projetId: string): MockContrat[] {
  return MOCK_CONTRATS.filter((c) => c.projet_id === projetId);
}

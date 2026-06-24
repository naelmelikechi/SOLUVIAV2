import { ACTIVE_CONTRACT_STATES } from '@/lib/utils/contrat-states';

export const ACTIVE_STATES_ARRAY = Array.from(ACTIVE_CONTRACT_STATES);

export interface DashboardFinancials {
  totalProduction: number; // HT - commission SOLUVIA (NPEC × taux / 1.2) prorata durée, part du mois courant
  totalFacture: number; // HT - sum of factures.montant_ht (clients reels uniquement)
  totalEncaisse: number; // HT - paiements TTC ramenes au prorata HT/TTC de chaque facture
  totalEnRetard: number; // HT - sum factures.montant_ht en retard moins encaisse HT partiel recu
  totalAFacturer: number; // HT - sum montant_prevu_ht des echeances pretes a emettre
  nbApprenantsActifs: number; // count of active contrats
  nbFormationsEnCours: number; // count distinct formations sur contrats actifs
  nbAbandons: number; // count contrats resilie ou ANNULE (synced)
  pedagogieAvgPct: number; // avg progression_percentage des contrats actifs (0-100)
  nbApprenantsRqth: number; // apprenants RQTH actifs (disabled_worker=true)
  rqthPct: number; // % RQTH parmi apprenants actifs (Qualiopi indicateur 14)
  tempsNonSaisi: number; // days without time entries this week
  tauxSaisieTemps: number; // % of time entries filled this month
}

export type KpiSnapshotMap = Record<string, number>;

/**
 * Fetch all global KPI snapshots for a given month.
 * Returns a map of type_kpi -> valeur.
 */
export interface MonthlyTrendRow {
  mois: string; // "Janv. 2026" etc.
  production: number;
  facture: number;
  encaisse: number;
  enRetard: number;
}

export interface InvoiceStatusBreakdown {
  emises: number;
  payees: number;
  en_retard: number;
  avoirs: number;
}

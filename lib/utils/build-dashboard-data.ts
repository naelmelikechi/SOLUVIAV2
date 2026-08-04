// lib/utils/build-dashboard-data.ts
// Helpers purs de transformation de donnees dashboard (sans hooks ni state React).

import { formatCurrency } from '@/lib/utils/formatters';
import type {
  DashboardFinancials,
  KpiSnapshotMap,
  PreviousPeriodFinancials,
} from '@/lib/queries/dashboard';

// ============================================================
// Types
// ============================================================

// Compteurs de tete du dashboard (calcules en Server Component).
// Defini ici (couche lib) ; les composants dashboard l'importent d'ici.
export interface DashboardData {
  projetsActifs: number;
  facturesEnRetard: number;
  facturesEmises: number;
  echeancesAFacturer: number;
  contratsActifs: number;
  contratsSansProgression: number;
  byType: { app: number; pdc: number; poe: number };
}

// Alerte affichee dans le bandeau AlertsStrip (components/dashboard).
export type Alert = {
  count: number;
  title: string;
  href: string;
  color: 'red' | 'orange' | 'blue';
};

export interface EvolutionRow {
  label: string;
  current: string;
  previous: string;
  /** Equivalents TTC (lignes financieres uniquement), deja formates. */
  currentTtc?: string;
  previousTtc?: string;
  change: number;
  unit: '%' | 'pt';
  positiveIsGood: boolean;
}

// ============================================================
// buildAlerts
// ============================================================

export function buildAlerts(
  data: Pick<
    DashboardData,
    'facturesEnRetard' | 'echeancesAFacturer' | 'contratsSansProgression'
  >,
  tempsNonSaisi: number,
): Alert[] {
  return [
    data.facturesEnRetard > 0
      ? {
          count: data.facturesEnRetard,
          title: 'Factures en retard',
          href: '/facturation',
          color: 'red' as const,
        }
      : null,
    data.echeancesAFacturer > 0
      ? {
          count: data.echeancesAFacturer,
          title: 'Échéances prêtes',
          href: '/facturation',
          color: 'blue' as const,
        }
      : null,
    tempsNonSaisi > 0
      ? {
          count: tempsNonSaisi,
          title: 'Jours sans saisie',
          href: '/temps',
          color: 'orange' as const,
        }
      : null,
    data.contratsSansProgression > 0
      ? {
          count: data.contratsSansProgression,
          title: 'Contrats sans progression',
          href: '/projets',
          color: 'orange' as const,
        }
      : null,
  ].filter((a): a is Alert => a !== null);
}

// ============================================================
// computeEvolution
// ============================================================

export function computeEvolution(
  hasPrevious: boolean,
  current: number,
  previousValue: number | undefined,
): number {
  if (!hasPrevious || previousValue === undefined || previousValue === 0) {
    return 0;
  }
  return Math.round(((current - previousValue) / previousValue) * 1000) / 10;
}

// ============================================================
// buildEvolutionData
// ============================================================

export function buildEvolutionData(
  data: Pick<DashboardData, 'projetsActifs' | 'contratsActifs'>,
  financials: Pick<
    DashboardFinancials,
    | 'totalProduction'
    | 'totalFacture'
    | 'totalEncaisse'
    | 'totalEnRetard'
    | 'totalProductionTtc'
    | 'totalFactureTtc'
    | 'totalEncaisseTtc'
    | 'totalEnRetardTtc'
  >,
  // Valeurs M-1 calculees en LIVE sur la fenetre precedente (evolution.ts) :
  // production/facture/encaisse periodises M-1, en retard = stock reconstitue
  // a la frontiere de la fenetre courante. Comparaison homogene, la ou
  // l'ancien code comparait des flux mensuels aux cumuls a date des snapshots
  // (production M-1 etait meme aliasee sur total_facture_ht).
  previousFinancials: PreviousPeriodFinancials,
  previousKpis: KpiSnapshotMap,
): EvolutionRow[] {
  const hasPrevious = Object.keys(previousKpis).length > 0;

  const prevProjetsActifs = previousKpis['projets_actifs'];
  const prevContratsActifs = previousKpis['contrats_actifs'];

  const calc = (current: number, previous: number | undefined) =>
    computeEvolution(hasPrevious, current, previous);

  return [
    {
      label: 'Production',
      current: formatCurrency(financials.totalProduction),
      previous: formatCurrency(previousFinancials.production),
      currentTtc: formatCurrency(financials.totalProductionTtc),
      previousTtc: formatCurrency(previousFinancials.productionTtc),
      change: computeEvolution(
        true,
        financials.totalProduction,
        previousFinancials.production,
      ),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Facturé',
      current: formatCurrency(financials.totalFacture),
      previous: formatCurrency(previousFinancials.facture),
      currentTtc: formatCurrency(financials.totalFactureTtc),
      previousTtc: formatCurrency(previousFinancials.factureTtc),
      change: computeEvolution(
        true,
        financials.totalFacture,
        previousFinancials.facture,
      ),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Encaissé',
      current: formatCurrency(financials.totalEncaisse),
      previous: formatCurrency(previousFinancials.encaisse),
      currentTtc: formatCurrency(financials.totalEncaisseTtc),
      previousTtc: formatCurrency(previousFinancials.encaisseTtc),
      change: computeEvolution(
        true,
        financials.totalEncaisse,
        previousFinancials.encaisse,
      ),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'En retard',
      current: formatCurrency(financials.totalEnRetard),
      previous: formatCurrency(previousFinancials.enRetard),
      currentTtc: formatCurrency(financials.totalEnRetardTtc),
      previousTtc: formatCurrency(previousFinancials.enRetardTtc),
      change: computeEvolution(
        true,
        financials.totalEnRetard,
        previousFinancials.enRetard,
      ),
      unit: '%',
      positiveIsGood: false,
    },
    {
      label: 'Projets actifs',
      current: String(data.projetsActifs),
      previous:
        hasPrevious && prevProjetsActifs !== undefined
          ? String(prevProjetsActifs)
          : '-',
      change: calc(data.projetsActifs, prevProjetsActifs),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Contrats actifs',
      current: String(data.contratsActifs),
      previous:
        hasPrevious && prevContratsActifs !== undefined
          ? String(prevContratsActifs)
          : '-',
      change: calc(data.contratsActifs, prevContratsActifs),
      unit: '%',
      positiveIsGood: true,
    },
  ];
}

// ============================================================
// handleExportExcel
// ============================================================

export function handleExportExcel(evolutionData: EvolutionRow[]) {
  const headers = ['KPI', 'Actuel', 'Précédent', 'Évolution'];
  const rows = evolutionData.map((row) => [
    row.label,
    row.current,
    row.previous,
    row.change === 0
      ? '-'
      : `${row.change > 0 ? '+' : ''}${row.change}${row.unit}`,
  ]);

  const csvContent = [headers, ...rows]
    .map((r) => r.map((c) => `"${c}"`).join(';'))
    .join('\n');

  const blob = new Blob(['﻿' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dashboard-evolution-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

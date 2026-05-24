// lib/utils/build-dashboard-data.ts
// Helpers purs de transformation de donnees dashboard (sans hooks ni state React).

import { formatCurrency } from '@/lib/utils/formatters';
import type { Alert } from '@/components/dashboard/alerts-strip';
import type {
  DashboardFinancials,
  KpiSnapshotMap,
} from '@/lib/queries/dashboard';
import type { DashboardData } from '@/components/dashboard/dashboard-page-client';

// ============================================================
// Types
// ============================================================

export interface EvolutionRow {
  label: string;
  current: string;
  previous: string;
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
    'totalProduction' | 'totalFacture' | 'totalEncaisse' | 'totalEnRetard'
  >,
  previousKpis: KpiSnapshotMap,
): EvolutionRow[] {
  const hasPrevious = Object.keys(previousKpis).length > 0;

  const prevTotalFacture = previousKpis['total_facture_ht'];
  const prevTotalEncaisse = previousKpis['total_encaisse'];
  const prevProjetsActifs = previousKpis['projets_actifs'];
  const prevContratsActifs = previousKpis['contrats_actifs'];
  const prevProduction = prevTotalFacture;

  const prevEnRetardAmount =
    prevTotalFacture !== undefined && prevTotalEncaisse !== undefined
      ? Math.max(0, prevTotalFacture - prevTotalEncaisse)
      : undefined;

  const calc = (current: number, previous: number | undefined) =>
    computeEvolution(hasPrevious, current, previous);

  return [
    {
      label: 'Production',
      current: formatCurrency(financials.totalProduction),
      previous:
        hasPrevious && prevProduction !== undefined
          ? formatCurrency(prevProduction)
          : '-',
      change: calc(financials.totalProduction, prevProduction),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Facturé',
      current: formatCurrency(financials.totalFacture),
      previous:
        hasPrevious && prevTotalFacture !== undefined
          ? formatCurrency(prevTotalFacture)
          : '-',
      change: calc(financials.totalFacture, prevTotalFacture),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Encaissé',
      current: formatCurrency(financials.totalEncaisse),
      previous:
        hasPrevious && prevTotalEncaisse !== undefined
          ? formatCurrency(prevTotalEncaisse)
          : '-',
      change: calc(financials.totalEncaisse, prevTotalEncaisse),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'En retard',
      current: formatCurrency(financials.totalEnRetard),
      previous:
        hasPrevious && prevEnRetardAmount !== undefined
          ? formatCurrency(prevEnRetardAmount)
          : '-',
      change: calc(financials.totalEnRetard, prevEnRetardAmount),
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

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Download, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/formatters';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  DashboardFinancials,
  KpiSnapshotMap,
  MonthlyTrendRow,
  InvoiceStatusBreakdown,
} from '@/lib/queries/dashboard';
import type { Periode } from '@/lib/utils/dashboard-periode';
import { RevenueTrendChart } from '@/components/dashboard/revenue-trend-chart';
import { InvoiceStatusChart } from '@/components/dashboard/invoice-status-chart';
import { useHiddenKpis } from '@/components/dashboard/use-hidden-kpis';
import { TrinityFunnel } from '@/components/dashboard/trinity-funnel';
import { ContextChips } from '@/components/dashboard/context-chips';
import { AlertsStrip, type Alert } from '@/components/dashboard/alerts-strip';
import { MiniKpiCard } from '@/components/dashboard/mini-kpi-card';

// ============================================================
// Types
// ============================================================

export interface DashboardData {
  projetsActifs: number;
  facturesEnRetard: number;
  facturesEmises: number;
  echeancesAFacturer: number;
  contratsActifs: number;
  contratsSansProgression: number;
}

interface EvolutionRow {
  label: string;
  current: string;
  previous: string;
  change: number;
  unit: '%' | 'pt';
  positiveIsGood: boolean;
}

// ============================================================
// Export helper
// ============================================================

function handleExportExcel(evolutionData: EvolutionRow[]) {
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

// ============================================================
// Main Component
// ============================================================

export function DashboardPageClient({
  data,
  financials,
  previousKpis,
  monthlyTrend,
  invoiceBreakdown,
  weekHours,
  periode: _periode,
}: {
  data: DashboardData;
  financials: DashboardFinancials;
  previousKpis: KpiSnapshotMap;
  monthlyTrend: MonthlyTrendRow[];
  invoiceBreakdown: InvoiceStatusBreakdown;
  weekHours: number;
  periode?: Periode;
}) {
  const [editMode, setEditMode] = useState(false);
  const { isHidden, toggle, hiddenKeys, restoreAll } = useHiddenKpis();

  const {
    totalProduction,
    totalFacture,
    totalEncaisse,
    totalEnRetard,
    totalAFacturer,
    nbApprenantsActifs,
    nbFormationsEnCours,
    nbAbandons,
    pedagogieAvgPct,
    nbApprenantsRqth,
    rqthPct,
    tauxSaisieTemps,
    tempsNonSaisi,
  } = financials;

  // ---- Alerts list (4 possible items, filtered to non-null) ----
  const alerts: Alert[] = [
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

  // ---- M-1 evolution helpers ----
  const hasPrevious = Object.keys(previousKpis).length > 0;

  function computeEvolution(
    current: number,
    previousValue: number | undefined,
  ): number {
    if (!hasPrevious || previousValue === undefined || previousValue === 0) {
      return 0;
    }
    return Math.round(((current - previousValue) / previousValue) * 1000) / 10;
  }

  // Map current KPIs to their M-1 snapshot keys
  const prevTotalFacture = previousKpis['total_facture_ht'];
  const prevTotalEncaisse = previousKpis['total_encaisse'];
  const prevProjetsActifs = previousKpis['projets_actifs'];
  const prevContratsActifs = previousKpis['contrats_actifs'];

  // Use total_facture_ht as proxy for production in M-1 (same as current)
  const prevProduction = prevTotalFacture;
  // Compute previous en retard amount (approximation: totalFacture - totalEncaisse)
  const prevEnRetardAmount =
    prevTotalFacture !== undefined && prevTotalEncaisse !== undefined
      ? Math.max(0, prevTotalFacture - prevTotalEncaisse)
      : undefined;

  const evolutionData: EvolutionRow[] = [
    {
      label: 'Production',
      current: formatCurrency(totalProduction),
      previous:
        hasPrevious && prevProduction !== undefined
          ? formatCurrency(prevProduction)
          : '-',
      change: computeEvolution(totalProduction, prevProduction),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Facturé',
      current: formatCurrency(totalFacture),
      previous:
        hasPrevious && prevTotalFacture !== undefined
          ? formatCurrency(prevTotalFacture)
          : '-',
      change: computeEvolution(totalFacture, prevTotalFacture),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Encaissé',
      current: formatCurrency(totalEncaisse),
      previous:
        hasPrevious && prevTotalEncaisse !== undefined
          ? formatCurrency(prevTotalEncaisse)
          : '-',
      change: computeEvolution(totalEncaisse, prevTotalEncaisse),
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'En retard',
      current: formatCurrency(totalEnRetard),
      previous:
        hasPrevious && prevEnRetardAmount !== undefined
          ? formatCurrency(prevEnRetardAmount)
          : '-',
      change: computeEvolution(totalEnRetard, prevEnRetardAmount),
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
      change: computeEvolution(data.projetsActifs, prevProjetsActifs),
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
      change: computeEvolution(data.contratsActifs, prevContratsActifs),
      unit: '%',
      positiveIsGood: true,
    },
  ];

  const productionTrend = computeEvolution(totalProduction, prevProduction);

  const renderIfVisible = (key: string, node: React.ReactNode) =>
    isHidden(key) ? null : node;

  return (
    <div className="space-y-5">
      {/* ========== Alerts ========== */}
      {renderIfVisible(
        'alerts',
        <AlertsStrip
          alerts={alerts}
          editMode={editMode}
          onHide={() => toggle('alerts')}
        />,
      )}

      {/* ========== Trinity Funnel ========== */}
      {renderIfVisible(
        'trinity',
        <TrinityFunnel
          production={totalProduction}
          facture={totalFacture}
          encaisse={totalEncaisse}
          productionTrend={productionTrend}
          editMode={editMode}
          onHide={() => toggle('trinity')}
        />,
      )}

      {/* ========== Context Chips ========== */}
      {renderIfVisible(
        'chips',
        <ContextChips
          enRetard={totalEnRetard}
          aFacturer={totalAFacturer}
          weekHours={weekHours}
          editMode={editMode}
          onHide={() => toggle('chips')}
        />,
      )}

      {/* ========== Personnalisation toolbar ========== */}
      <div className="flex items-center justify-end gap-2 text-xs">
        {hiddenKeys.size > 0 && (
          <span className="text-muted-foreground">
            {hiddenKeys.size} bloc(s) masqué(s) ·{' '}
            <button
              type="button"
              onClick={restoreAll}
              className="text-primary hover:underline"
            >
              Restaurer
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 transition-colors',
            editMode
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border hover:bg-accent',
          )}
        >
          {editMode ? 'Terminer' : 'Personnaliser'}
        </button>
      </div>

      {/* ========== Activite operationnelle ========== */}
      <section>
        <h2 className="text-muted-foreground mb-3 text-[10px] font-semibold tracking-wider uppercase">
          Activité opérationnelle
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {renderIfVisible(
            'projetsActifs',
            <MiniKpiCard
              label="Projets actifs"
              value={String(data.projetsActifs)}
              subtitle="en cours de suivi"
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('projetsActifs')}
            />,
          )}
          {renderIfVisible(
            'contratsActifs',
            <MiniKpiCard
              label="Contrats"
              value={String(data.contratsActifs)}
              subtitle="tous projets confondus"
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('contratsActifs')}
            />,
          )}
          {renderIfVisible(
            'apprenantsActifs',
            <MiniKpiCard
              label="Apprenants"
              value={String(nbApprenantsActifs)}
              subtitle="contrats en cours"
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('apprenantsActifs')}
            />,
          )}
          {renderIfVisible(
            'formationsEnCours',
            <MiniKpiCard
              label="Formations"
              value={String(nbFormationsEnCours)}
              subtitle="en cours (Eduvia)"
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('formationsEnCours')}
            />,
          )}
          {renderIfVisible(
            'tauxSaisieTemps',
            <MiniKpiCard
              label="Saisie temps"
              value={`${tauxSaisieTemps}%`}
              subtitle="moyenne équipe"
              href="/temps"
              editMode={editMode}
              onHide={() => toggle('tauxSaisieTemps')}
            />,
          )}
        </div>
      </section>

      {/* ========== Qualite & pedagogie ========== */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            Qualité &amp; pédagogie
          </h2>
          <Link
            href="/qualiopi"
            className="text-primary text-[10px] font-medium hover:underline"
          >
            Voir Qualiopi ›
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {renderIfVisible(
            'pedagogie',
            <MiniKpiCard
              label="Progression pédagogie"
              value={`${pedagogieAvgPct}%`}
              subtitle="moyenne contrats actifs"
              href="/qualiopi"
              editMode={editMode}
              onHide={() => toggle('pedagogie')}
            />,
          )}
          {renderIfVisible(
            'abandons',
            <MiniKpiCard
              label="Abandons"
              value={String(nbAbandons)}
              subtitle="résiliés / annulés"
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('abandons')}
            />,
          )}
          {renderIfVisible(
            'rqth',
            <MiniKpiCard
              label="Apprenants RQTH"
              value={`${rqthPct}%`}
              subtitle={`${nbApprenantsRqth} apprenant(s) en situation de handicap`}
              href="/projets"
              editMode={editMode}
              onHide={() => toggle('rqth')}
            />,
          )}
        </div>
      </section>

      {/* ========== Visualisations ========== */}
      <section>
        <h2 className="text-muted-foreground mb-3 text-[10px] font-semibold tracking-wider uppercase">
          Visualisations
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RevenueTrendChart data={monthlyTrend} />
          <InvoiceStatusChart data={invoiceBreakdown} />
        </div>
      </section>

      {/* ========== Evolution M/M-1 ========== */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            Évolution M / M-1
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportExcel(evolutionData)}
          >
            <Download className="h-3.5 w-3.5" data-icon="inline-start" />
            Exporter
          </Button>
        </div>
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">KPI</TableHead>
                <TableHead className="text-right">Actuel</TableHead>
                <TableHead className="text-right">M-1</TableHead>
                <TableHead className="pr-4 text-right">Évol.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evolutionData.map((row) => {
                const isPositive = row.change > 0;
                const isGood = row.positiveIsGood ? isPositive : !isPositive;
                const changeSign = isPositive ? '+' : '';
                const changeSuffix = row.unit === 'pt' ? 'pt' : '%';

                return (
                  <TableRow key={row.label}>
                    <TableCell className="pl-4 font-medium">
                      {row.label}
                    </TableCell>
                    <TableCell className="num text-right">
                      {row.current}
                    </TableCell>
                    <TableCell className="num text-muted-foreground text-right">
                      {row.previous}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {row.change === 0 ? (
                        <span className="text-muted-foreground text-xs">-</span>
                      ) : (
                        <span
                          className={cn(
                            'num inline-flex items-center gap-0.5 text-xs font-semibold',
                            isGood
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {isPositive ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {changeSign}
                          {row.change}
                          {changeSuffix}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}

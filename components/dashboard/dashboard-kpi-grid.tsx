'use client';

// components/dashboard/dashboard-kpi-grid.tsx
// Grille des KPI cards (operationnels + qualite/pedagogie), visualisations et tableau evolution M/M-1.

import Link from 'next/link';
import { Download, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { RevenueTrendChart } from '@/components/dashboard/revenue-trend-chart';
import { InvoiceStatusChart } from '@/components/dashboard/invoice-status-chart';
import { MiniKpiCard } from '@/components/dashboard/mini-kpi-card';
import type {
  MonthlyTrendRow,
  InvoiceStatusBreakdown,
} from '@/lib/queries/dashboard';
import type { EvolutionRow } from '@/lib/utils/build-dashboard-data';
import { handleExportExcel } from '@/lib/utils/build-dashboard-data';

interface DashboardKpiGridProps {
  // Activite operationnelle
  projetsActifs: number;
  contratsActifs: number;
  nbApprenantsActifs: number;
  nbFormationsEnCours: number;
  tauxSaisieTemps: number;
  // Qualite & pedagogie
  pedagogieAvgPct: number;
  nbAbandons: number;
  nbApprenantsRqth: number;
  rqthPct: number;
  // Visualisations
  monthlyTrend: MonthlyTrendRow[];
  invoiceBreakdown: InvoiceStatusBreakdown;
  // Evolution M/M-1
  evolutionData: EvolutionRow[];
  // Edit mode
  editMode: boolean;
  isHidden: (key: string) => boolean;
  onHide: (key: string) => void;
}

export function DashboardKpiGrid({
  projetsActifs,
  contratsActifs,
  nbApprenantsActifs,
  nbFormationsEnCours,
  tauxSaisieTemps,
  pedagogieAvgPct,
  nbAbandons,
  nbApprenantsRqth,
  rqthPct,
  monthlyTrend,
  invoiceBreakdown,
  evolutionData,
  editMode,
  isHidden,
  onHide,
}: DashboardKpiGridProps) {
  const renderIfVisible = (key: string, node: React.ReactNode) =>
    isHidden(key) ? null : node;

  return (
    <>
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
              value={String(projetsActifs)}
              subtitle="en cours de suivi"
              href="/projets"
              editMode={editMode}
              onHide={() => onHide('projetsActifs')}
            />,
          )}
          {renderIfVisible(
            'contratsActifs',
            <MiniKpiCard
              label="Contrats"
              value={String(contratsActifs)}
              subtitle="tous projets confondus"
              href="/projets"
              editMode={editMode}
              onHide={() => onHide('contratsActifs')}
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
              onHide={() => onHide('apprenantsActifs')}
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
              onHide={() => onHide('formationsEnCours')}
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
              onHide={() => onHide('tauxSaisieTemps')}
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
              onHide={() => onHide('pedagogie')}
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
              onHide={() => onHide('abandons')}
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
              onHide={() => onHide('rqth')}
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
    </>
  );
}

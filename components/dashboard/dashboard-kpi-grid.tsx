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

// Sparkline nodes rendus cote serveur et passes en prop (composition pattern Next.js App Router).
// Seules les cles correspondant a un type_kpi reel dans kpi_snapshots sont listees.
export interface DashboardSparklines {
  projetsActifs?: React.ReactNode;
  contratsActifs?: React.ReactNode;
  facturesEmises?: React.ReactNode;
  facturesEnRetard?: React.ReactNode;
  totalEncaisse?: React.ReactNode;
}

interface DashboardKpiGridProps {
  // Activite operationnelle
  projetsActifs: number;
  contratsActifs: number;
  byType: { app: number; pdc: number; poe: number };
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
  // Sparklines (Server Component nodes injectes depuis page.tsx)
  sparklines?: DashboardSparklines;
}

export function DashboardKpiGrid({
  projetsActifs,
  contratsActifs,
  byType,
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
  sparklines,
}: DashboardKpiGridProps) {
  return (
    <>
      {/* ========== Activite operationnelle ========== */}
      <section>
        <h2 className="text-muted-foreground mb-3 text-[10px] font-semibold tracking-wider uppercase">
          Activité opérationnelle
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {!isHidden('projetsActifs') && (
            <MiniKpiCard
              label="Projets actifs"
              value={String(projetsActifs)}
              subtitle="en cours de suivi"
              sparkline={sparklines?.projetsActifs}
              href="/projets"
              editMode={editMode}
              onHide={() => onHide('projetsActifs')}
            />
          )}
          {!isHidden('contratsActifs') && (
            <MiniKpiCard
              label="Contrats"
              value={String(contratsActifs)}
              subtitle={`dont ${byType.app} APP · ${byType.pdc} PDC · ${byType.poe} POE`}
              sparkline={sparklines?.contratsActifs}
              href="/projets"
              editMode={editMode}
              onHide={() => onHide('contratsActifs')}
            />
          )}
          {!isHidden('apprenantsActifs') && (
            <MiniKpiCard
              label="Apprenants"
              value={String(nbApprenantsActifs)}
              subtitle="contrats en cours"
              href="/projets"
              editMode={editMode}
              onHide={() => onHide('apprenantsActifs')}
            />
          )}
          {!isHidden('formationsEnCours') && (
            <MiniKpiCard
              label="Formations"
              value={String(nbFormationsEnCours)}
              subtitle="en cours (Eduvia)"
              href="/projets"
              editMode={editMode}
              onHide={() => onHide('formationsEnCours')}
            />
          )}
          {!isHidden('tauxSaisieTemps') && (
            <MiniKpiCard
              label="Saisie temps"
              value={`${tauxSaisieTemps}%`}
              subtitle="moyenne équipe"
              href="/temps"
              editMode={editMode}
              onHide={() => onHide('tauxSaisieTemps')}
            />
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
          {!isHidden('pedagogie') && (
            <MiniKpiCard
              label="Progression pédagogie"
              value={`${pedagogieAvgPct}%`}
              subtitle="moyenne contrats actifs"
              href="/qualiopi"
              editMode={editMode}
              onHide={() => onHide('pedagogie')}
            />
          )}
          {!isHidden('abandons') && (
            <MiniKpiCard
              label="Abandons"
              value={String(nbAbandons)}
              subtitle="résiliés / annulés"
              href="/projets"
              editMode={editMode}
              onHide={() => onHide('abandons')}
            />
          )}
          {!isHidden('rqth') && (
            <MiniKpiCard
              label="Apprenants RQTH"
              value={`${rqthPct}%`}
              subtitle={`${nbApprenantsRqth} apprenant(s) en situation de handicap`}
              href="/projets"
              editMode={editMode}
              onHide={() => onHide('rqth')}
            />
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
            <Download className="size-3.5" data-icon="inline-start" />
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
                            <ArrowUpRight className="size-3" />
                          ) : (
                            <ArrowDownRight className="size-3" />
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

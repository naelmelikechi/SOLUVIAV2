'use client';

import Link from 'next/link';
import {
  TrendingUp,
  FileText,
  CircleCheck,
  AlertTriangle,
  ClipboardList,
  Users,
  GraduationCap,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  CheckCircle2,
} from 'lucide-react';

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
import type { DashboardFinancials } from '@/lib/queries/dashboard';

// ============================================================
// Types
// ============================================================

export interface DashboardData {
  projetsActifs: number;
  facturesEnRetard: number;
  facturesEmises: number;
  tachesEnAttente: number;
  echeancesAFacturer: number;
  contratsActifs: number;
}

type Alert = {
  count: number;
  title: string;
  description: string;
  href: string;
  color: 'red' | 'orange' | 'blue';
};

// ============================================================
// Alert color mapping
// ============================================================

const alertColorMap = {
  red: {
    bg: 'bg-red-500',
    ring: 'ring-red-500/20',
    hoverBg: 'hover:bg-red-50 dark:hover:bg-red-950/20',
  },
  orange: {
    bg: 'bg-orange-500',
    ring: 'ring-orange-500/20',
    hoverBg: 'hover:bg-orange-50 dark:hover:bg-orange-950/20',
  },
  blue: {
    bg: 'bg-blue-500',
    ring: 'ring-blue-500/20',
    hoverBg: 'hover:bg-blue-50 dark:hover:bg-blue-950/20',
  },
};

// ============================================================
// KPI Card sub-component
// ============================================================

const kpiColorMap = {
  green: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
  },
  blue: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
  },
  red: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
  },
  purple: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-400',
  },
  orange: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
  },
};

interface KpiCardProps {
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  isNegativeMetric?: boolean;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: keyof typeof kpiColorMap;
}

function KpiCard({
  label,
  value,
  trend,
  trendUp,
  isNegativeMetric,
  subtitle,
  icon: Icon,
  color,
}: KpiCardProps) {
  const colors = kpiColorMap[color];
  const trendIsGood =
    trendUp !== undefined ? (isNegativeMetric ? !trendUp : trendUp) : undefined;

  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            colors.bg,
          )}
        >
          <Icon className={cn('h-4 w-4', colors.text)} />
        </div>
        <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {trend && (
        <div
          className={cn(
            'mt-1 flex items-center gap-1 text-xs',
            trendIsGood
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400',
          )}
        >
          {trendUp ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          <span className="font-medium tabular-nums">vs M-1 : {trend}</span>
        </div>
      )}
      {subtitle && (
        <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>
      )}
    </Card>
  );
}

// ============================================================
// Evolution table data
// ============================================================

interface EvolutionRow {
  label: string;
  current: string;
  previous: string;
  change: number;
  unit: '%' | 'pt';
  positiveIsGood: boolean;
}

function handleExportExcel(evolutionData: EvolutionRow[]) {
  const headers = ['KPI', 'Actuel', 'Précédent', 'Évolution'];
  const rows = evolutionData.map((row) => [
    row.label,
    row.current,
    row.previous,
    row.change === 0
      ? '—'
      : `${row.change > 0 ? '+' : ''}${row.change}${row.unit}`,
  ]);

  const csvContent = [headers, ...rows]
    .map((r) => r.map((c) => `"${c}"`).join(';'))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], {
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
}: {
  data: DashboardData;
  financials: DashboardFinancials;
}) {
  // ---- Alerts from real data ----
  const tempsNonSaisi = financials.tempsNonSaisi;

  const alerts: Alert[] = [
    data.facturesEnRetard > 0
      ? {
          count: data.facturesEnRetard,
          title: 'Factures en retard',
          description: 'Paiements non reçus après échéance',
          href: '/facturation',
          color: 'red' as const,
        }
      : null,
    data.echeancesAFacturer > 0
      ? {
          count: data.echeancesAFacturer,
          title: 'Échéances à facturer',
          description: 'Échéances prêtes à émettre',
          href: '/facturation',
          color: 'blue' as const,
        }
      : null,
    data.tachesEnAttente > 0
      ? {
          count: data.tachesEnAttente,
          title: 'Tâches qualité en attente',
          description: 'Actions à réaliser sur les projets actifs',
          href: '/qualite',
          color: 'orange' as const,
        }
      : null,
    tempsNonSaisi > 0
      ? {
          count: tempsNonSaisi,
          title: 'Temps non saisi',
          description: `${tempsNonSaisi} jour(s) sans saisie cette semaine`,
          href: '/temps',
          color: 'orange' as const,
        }
      : null,
  ].filter((a): a is Alert => a !== null);

  // ---- Financial KPIs from real data ----
  const { totalProduction, totalFacture, totalEncaisse, nbApprenantsActifs } =
    financials;
  const totalEnRetard = Math.max(0, totalFacture - totalEncaisse);

  // ---- Evolution data (no historical comparison yet) ----
  const evolutionData: EvolutionRow[] = [
    {
      label: 'Production',
      current: formatCurrency(totalProduction),
      previous: '—',
      change: 0,
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Facturé',
      current: formatCurrency(totalFacture),
      previous: '—',
      change: 0,
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Encaissé',
      current: formatCurrency(totalEncaisse),
      previous: '—',
      change: 0,
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'En retard',
      current: formatCurrency(totalEnRetard),
      previous: '—',
      change: 0,
      unit: '%',
      positiveIsGood: false,
    },
    {
      label: 'Projets actifs',
      current: String(data.projetsActifs),
      previous: '—',
      change: 0,
      unit: '%',
      positiveIsGood: true,
    },
    {
      label: 'Contrats actifs',
      current: String(data.contratsActifs),
      previous: '—',
      change: 0,
      unit: '%',
      positiveIsGood: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ========== Alerts Block ========== */}
      {alerts.length > 0 ? (
        <Card className="divide-y p-0">
          {alerts.map((alert) => {
            const colors = alertColorMap[alert.color];
            return (
              <Link
                key={alert.title}
                href={alert.href}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 transition-colors first:rounded-t-xl last:rounded-b-xl',
                  colors.hoverBg,
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ring-4',
                    colors.bg,
                    colors.ring,
                  )}
                >
                  {alert.count}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {alert.description}
                  </p>
                </div>
                <ArrowUpRight className="text-muted-foreground h-4 w-4 shrink-0" />
              </Link>
            );
          })}
        </Card>
      ) : (
        <Card className="flex items-center gap-3 border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950/30">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-200">
              Tout est en ordre
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              Aucune alerte active
            </p>
          </div>
        </Card>
      )}

      {/* ========== Financial KPIs ========== */}
      <section>
        <h2 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
          Performance financière
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Production"
            value={formatCurrency(totalProduction)}
            icon={TrendingUp}
            color="green"
          />
          <KpiCard
            label="Facturé"
            value={formatCurrency(totalFacture)}
            icon={FileText}
            color="blue"
          />
          <KpiCard
            label="Encaissé"
            value={formatCurrency(totalEncaisse)}
            icon={CircleCheck}
            color="green"
          />
          <KpiCard
            label="En retard"
            value={formatCurrency(totalEnRetard)}
            isNegativeMetric
            icon={AlertTriangle}
            color="red"
          />
        </div>
      </section>

      {/* ========== Operational KPIs ========== */}
      <section>
        <h2 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
          Activité opérationnelle
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Projets actifs"
            value={String(data.projetsActifs)}
            subtitle="en cours de suivi"
            icon={ClipboardList}
            color="green"
          />
          <KpiCard
            label="Contrats actifs"
            value={String(data.contratsActifs)}
            subtitle="tous projets confondus"
            icon={Users}
            color="blue"
          />
          <KpiCard
            label="Apprenants actifs"
            value={String(nbApprenantsActifs)}
            subtitle="contrats en cours"
            icon={GraduationCap}
            color="purple"
          />
          <KpiCard
            label="Temps non saisi"
            value={`${tempsNonSaisi}j`}
            subtitle="cette semaine"
            icon={Calendar}
            color={tempsNonSaisi > 0 ? 'orange' : 'green'}
          />
        </div>
      </section>

      {/* ========== Evolution Table ========== */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
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
        <Card className="p-0">
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
                    <TableCell className="text-right tabular-nums">
                      {row.current}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {row.previous}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {row.change === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <span
                          className={cn(
                            'inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
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

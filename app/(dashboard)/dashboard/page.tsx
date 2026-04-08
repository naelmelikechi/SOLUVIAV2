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
import { PageHeader } from '@/components/shared/page-header';
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
import {
  MOCK_PROJETS,
  MOCK_FINANCE,
  getFactures,
  getEcheancesPending,
} from '@/lib/mock-data';

// ============================================================
// Data computations
// ============================================================

const projetsActifs = MOCK_PROJETS.filter((p) => p.statut === 'actif');

// Alerts
const facturesEnRetard = getFactures().filter((f) => f.statut === 'en_retard');
const echeancesPending = getEcheancesPending();
const tachesQualite = projetsActifs.reduce(
  (sum, p) => sum + p.taches_a_realiser,
  0,
);
const tempsNonSaisi = 2; // mock — 2 projets sans saisie aujourd'hui

type Alert = {
  count: number;
  title: string;
  description: string;
  href: string;
  color: 'red' | 'orange' | 'blue';
};

const alerts: Alert[] = [
  facturesEnRetard.length > 0
    ? {
        count: facturesEnRetard.length,
        title: 'Factures en retard',
        description: 'Paiements non reçus après échéance',
        href: '/facturation',
        color: 'red' as const,
      }
    : null,
  echeancesPending.length > 0
    ? {
        count: echeancesPending.length,
        title: 'Échéances à facturer',
        description: 'Échéances prêtes à émettre',
        href: '/facturation',
        color: 'blue' as const,
      }
    : null,
  tachesQualite > 0
    ? {
        count: tachesQualite,
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
        description: `${tempsNonSaisi} projets sans saisie aujourd'hui`,
        href: '/temps',
        color: 'orange' as const,
      }
    : null,
].filter((a): a is Alert => a !== null);

// Financial KPIs
const totalProduction = Object.values(MOCK_FINANCE).reduce(
  (sum, f) => sum + f.production_opco,
  0,
);
const totalFacture = Object.values(MOCK_FINANCE).reduce(
  (sum, f) => sum + f.facture_opco,
  0,
);
const totalEncaisse = Object.values(MOCK_FINANCE).reduce(
  (sum, f) => sum + f.encaisse_opco,
  0,
);
const totalEnRetard = totalFacture - totalEncaisse;

// Operational KPIs
const nbProjetsActifs = projetsActifs.length;
const nbContratsActifs = 65; // mock
const nbApprenantsActifs = projetsActifs.reduce(
  (sum, p) => sum + p.apprentis_actifs,
  0,
);
const tauxSaisieTemps = 87; // mock

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
// Evolution table data (M vs M-1)
// ============================================================

const prevProduction = totalProduction * 0.948;
const prevFacture = totalFacture * 0.97;
const prevEncaisse = totalEncaisse * 1.029;
const prevEnRetard = totalEnRetard * 0.876;

interface EvolutionRow {
  label: string;
  current: string;
  previous: string;
  change: number;
  unit: '%' | 'pt';
  positiveIsGood: boolean;
}

const evolutionData: EvolutionRow[] = [
  {
    label: 'Production',
    current: formatCurrency(totalProduction),
    previous: formatCurrency(prevProduction),
    change: 5.2,
    unit: '%',
    positiveIsGood: true,
  },
  {
    label: 'Facturé',
    current: formatCurrency(totalFacture),
    previous: formatCurrency(prevFacture),
    change: 3.1,
    unit: '%',
    positiveIsGood: true,
  },
  {
    label: 'Encaissé',
    current: formatCurrency(totalEncaisse),
    previous: formatCurrency(prevEncaisse),
    change: -2.8,
    unit: '%',
    positiveIsGood: true,
  },
  {
    label: 'En retard',
    current: formatCurrency(totalEnRetard),
    previous: formatCurrency(prevEnRetard),
    change: 12.4,
    unit: '%',
    positiveIsGood: false,
  },
  {
    label: 'Projets actifs',
    current: String(nbProjetsActifs),
    previous: String(nbProjetsActifs - 1),
    change: 1,
    unit: '%',
    positiveIsGood: true,
  },
  {
    label: 'Taux complétion qualité',
    current: '82%',
    previous: '79%',
    change: 3,
    unit: 'pt',
    positiveIsGood: true,
  },
];

// ============================================================
// Export helper
// ============================================================

function handleExportExcel() {
  const headers = ['KPI', 'Avril 2026', 'Mars 2026', 'Évolution'];
  const rows = evolutionData.map((row) => [
    row.label,
    row.current,
    row.previous,
    `${row.change > 0 ? '+' : ''}${row.change}${row.unit}`,
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
  link.download = 'dashboard-evolution-avril-2026.csv';
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// Component
// ============================================================

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="KPIs et alertes opérationnelles"
      />

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
            trend="+5,2%"
            trendUp
            icon={TrendingUp}
            color="green"
          />
          <KpiCard
            label="Facturé"
            value={formatCurrency(totalFacture)}
            trend="+3,1%"
            trendUp
            icon={FileText}
            color="blue"
          />
          <KpiCard
            label="Encaissé"
            value={formatCurrency(totalEncaisse)}
            trend="-2,8%"
            trendUp={false}
            icon={CircleCheck}
            color="green"
          />
          <KpiCard
            label="En retard"
            value={formatCurrency(totalEnRetard)}
            trend="+12,4%"
            trendUp
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
            value={String(nbProjetsActifs)}
            subtitle="en cours de suivi"
            icon={ClipboardList}
            color="green"
          />
          <KpiCard
            label="Contrats actifs"
            value={String(nbContratsActifs)}
            subtitle="tous projets confondus"
            icon={Users}
            color="blue"
          />
          <KpiCard
            label="Apprenants actifs"
            value={String(nbApprenantsActifs)}
            subtitle="sur les projets actifs"
            icon={GraduationCap}
            color="purple"
          />
          <KpiCard
            label="Taux saisie temps"
            value={`${tauxSaisieTemps}%`}
            subtitle="18/20 jours ouvrables"
            icon={Calendar}
            color="orange"
          />
        </div>
      </section>

      {/* ========== Evolution Table ========== */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Évolution M / M-1
          </h2>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="h-3.5 w-3.5" data-icon="inline-start" />
            Exporter
          </Button>
        </div>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">KPI</TableHead>
                <TableHead className="text-right">Avril 2026</TableHead>
                <TableHead className="text-right">Mars 2026</TableHead>
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

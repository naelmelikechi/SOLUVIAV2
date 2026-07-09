import { Suspense } from 'react';
import type { Metadata } from 'next';
import {
  getDashboardData,
  getDashboardFinancials,
  getKpiSnapshots,
  getMonthlyTrend,
  getInvoiceStatusBreakdown,
  getUserWeekHours,
} from '@/lib/queries/dashboard';
import { getUser } from '@/lib/queries/users';
import { getJoursSansSaisie } from '@/lib/queries/temps';
import { getKpiSeriesBatch } from '@/lib/queries/kpi-history';
import {
  getIndicateursScope,
  type Period,
  type TechPeriod,
} from '@/lib/queries/indicateurs';
import { isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { DashboardPageClient } from '@/components/dashboard/dashboard-page-client';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { Sparkline } from '@/components/shared/sparkline';
import {
  QualitePedagogieSection,
  QualitePedagogieSectionSkeleton,
} from '@/components/dashboard/qualite-pedagogie-section';
import { CdpSection } from '@/components/indicateurs/cdp-section';
import { TechSection } from '@/components/indicateurs/tech-section';
import {
  PilotageTabs,
  type PilotageTab,
} from '@/components/pilotage/pilotage-tabs';
import { resolvePeriode, type PeriodeKey } from '@/lib/utils/dashboard-periode';
import { format, startOfMonth, addMonths } from 'date-fns';

export const metadata: Metadata = { title: 'Pilotage - SOLUVIA' };
export const revalidate = 30;

// /pilotage fusionne les anciens /dashboard (Vue d'ensemble) et /indicateurs
// (Ratios CDP + Produit & Tech). Un onglet = un searchParam ?tab= ; seules les
// données de l'onglet actif sont fetchées.

const VALID_PERIODES: PeriodeKey[] = ['ce_mois', 'mois_precedent', '30j'];

function isPeriodeKey(v: string): v is PeriodeKey {
  return (VALID_PERIODES as readonly string[]).includes(v);
}

function parsePeriod(raw: string | undefined): Period {
  return raw === 'month' ? 'month' : 'week';
}

function parseTechPeriod(raw: string | undefined): TechPeriod {
  return raw === 'month' ? 'month' : 'cycle';
}

const TAB_DESCRIPTIONS: Record<string, string> = {
  '': 'KPIs et alertes opérationnelles',
  ratios: 'Ratios CDP par CFA',
  tech: 'Suivi des idées et de la livraison produit',
};

async function VueEnsembleTab({ periodeKey }: { periodeKey: PeriodeKey }) {
  const now = new Date();
  const periode = resolvePeriode(periodeKey, now);
  const previousMonth = format(startOfMonth(addMonths(now, -1)), 'yyyy-MM-dd');

  const user = await getUser();
  if (!user) return null;

  const scope: 'global' | 'cdp' = isAdmin(user.role) ? 'global' : 'cdp';
  const scopeId: string | null = isAdmin(user.role) ? null : user.id;

  const [
    data,
    financials,
    previousKpis,
    monthlyTrend,
    invoiceBreakdown,
    weekHours,
    pageKpiSeries,
    joursSansSaisie,
  ] = await Promise.all([
    getDashboardData(),
    getDashboardFinancials(periode),
    getKpiSnapshots(previousMonth),
    getMonthlyTrend(),
    getInvoiceStatusBreakdown(),
    getUserWeekHours(),
    getKpiSeriesBatch({
      kpiTypes: ['projets_actifs', 'contrats_actifs'],
      scope,
      scopeId,
    }),
    getJoursSansSaisie(user.id),
  ]);

  // Sparklines sont des Server Components async : on les instancie ici (Server Component)
  // et on les passe comme ReactNode au client via la prop sparklines.
  // Seules les cles reellement rendues par DashboardKpiGrid sont construites.
  const sparklines = {
    projetsActifs: (
      <Sparkline
        kpiType="projets_actifs"
        scope={scope}
        scopeId={scopeId}
        color="blue"
        points={pageKpiSeries.get('projets_actifs') ?? []}
      />
    ),
    contratsActifs: (
      <Sparkline
        kpiType="contrats_actifs"
        scope={scope}
        scopeId={scopeId}
        color="blue"
        points={pageKpiSeries.get('contrats_actifs') ?? []}
      />
    ),
  };

  return (
    <>
      <DashboardPageClient
        data={data}
        financials={financials}
        previousKpis={previousKpis}
        monthlyTrend={monthlyTrend}
        invoiceBreakdown={invoiceBreakdown}
        weekHours={weekHours}
        joursSansSaisie={joursSansSaisie}
        periode={periode}
        sparklines={sparklines}
      />
      <Suspense fallback={<QualitePedagogieSectionSkeleton />}>
        <QualitePedagogieSection scope={scope} scopeId={scopeId} />
      </Suspense>
    </>
  );
}

export default async function PilotagePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    periode?: string;
    p?: string;
    t?: string;
  }>;
}) {
  const params = await searchParams;

  // Vue d'ensemble : visible par tous (comme l'ancien /dashboard).
  // Ratios CDP / Produit & Tech : mêmes droits que l'ancien /indicateurs.
  const indicateursScope = await getIndicateursScope();
  const showRatios =
    indicateursScope?.kind === 'admin' || indicateursScope?.kind === 'cdp';
  const showTech = indicateursScope !== null;

  const tabs: PilotageTab[] = [
    { value: '', label: "Vue d'ensemble" },
    ...(showRatios ? [{ value: 'ratios', label: 'Ratios CDP' }] : []),
    ...(showTech ? [{ value: 'tech', label: 'Produit & Tech' }] : []),
  ];

  const requested = params.tab ?? '';
  const tab = tabs.some((t) => t.value === requested) ? requested : '';

  const periodeKey: PeriodeKey =
    params.periode && isPeriodeKey(params.periode) ? params.periode : 'ce_mois';
  const periodeLabel = resolvePeriode(periodeKey, new Date()).label;

  return (
    <div className="space-y-6">
      <PageHeader title="Pilotage" description={TAB_DESCRIPTIONS[tab]}>
        {tab === '' && (
          <PeriodSelector current={periodeKey} label={periodeLabel} />
        )}
      </PageHeader>
      <PilotageTabs tabs={tabs} current={tab} />
      {tab === '' && <VueEnsembleTab periodeKey={periodeKey} />}
      {tab === 'ratios' && showRatios && indicateursScope && (
        <CdpSection scope={indicateursScope} period={parsePeriod(params.p)} />
      )}
      {tab === 'tech' && showTech && (
        <TechSection period={parseTechPeriod(params.t)} />
      )}
    </div>
  );
}

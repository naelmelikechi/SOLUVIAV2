'use client';

import { useState } from 'react';
import type {
  DashboardFinancials,
  KpiSnapshotMap,
  MonthlyTrendRow,
  InvoiceStatusBreakdown,
} from '@/lib/queries/dashboard';
import type { Periode } from '@/lib/utils/dashboard-periode';
import { useHiddenKpis } from '@/components/dashboard/use-hidden-kpis';
import { DashboardAlerts } from '@/components/dashboard/dashboard-alerts';
import {
  DashboardKpiGrid,
  type DashboardSparklines,
} from '@/components/dashboard/dashboard-kpi-grid';
import {
  buildAlerts,
  buildEvolutionData,
  computeEvolution,
} from '@/lib/utils/build-dashboard-data';

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
  byType: { app: number; pdc: number; poe: number };
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
  joursSansSaisie,
  periode,
  sparklines,
}: {
  data: DashboardData;
  financials: DashboardFinancials;
  previousKpis: KpiSnapshotMap;
  monthlyTrend: MonthlyTrendRow[];
  invoiceBreakdown: InvoiceStatusBreakdown;
  weekHours: number;
  joursSansSaisie: number;
  periode?: Periode;
  sparklines?: DashboardSparklines;
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
  } = financials;

  const alerts = buildAlerts(data, joursSansSaisie);
  const evolutionData = buildEvolutionData(data, financials, previousKpis);

  const hasPrevious = Object.keys(previousKpis).length > 0;
  const productionTrend = computeEvolution(
    hasPrevious,
    totalProduction,
    previousKpis['total_facture_ht'],
  );

  return (
    <div className="space-y-5">
      <DashboardAlerts
        alerts={alerts}
        totalProduction={totalProduction}
        totalFacture={totalFacture}
        totalEncaisse={totalEncaisse}
        productionTrend={productionTrend}
        totalEnRetard={totalEnRetard}
        totalAFacturer={totalAFacturer}
        weekHours={weekHours}
        periodeLabel={periode?.label}
        editMode={editMode}
        hiddenKeys={hiddenKeys}
        onHide={toggle}
        onToggleEditMode={() => setEditMode((v) => !v)}
        onRestoreAll={restoreAll}
        isHidden={isHidden}
      />

      <DashboardKpiGrid
        projetsActifs={data.projetsActifs}
        contratsActifs={data.contratsActifs}
        byType={data.byType}
        nbApprenantsActifs={nbApprenantsActifs}
        nbFormationsEnCours={nbFormationsEnCours}
        tauxSaisieTemps={tauxSaisieTemps}
        pedagogieAvgPct={pedagogieAvgPct}
        nbAbandons={nbAbandons}
        nbApprenantsRqth={nbApprenantsRqth}
        rqthPct={rqthPct}
        monthlyTrend={monthlyTrend}
        invoiceBreakdown={invoiceBreakdown}
        evolutionData={evolutionData}
        editMode={editMode}
        isHidden={isHidden}
        onHide={toggle}
        sparklines={sparklines}
      />
    </div>
  );
}

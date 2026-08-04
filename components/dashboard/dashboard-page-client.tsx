'use client';

import { useState } from 'react';
import type {
  DashboardFinancials,
  KpiSnapshotMap,
  MonthlyTrendRow,
  InvoiceStatusBreakdown,
  PreviousPeriodFinancials,
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
  type DashboardData,
} from '@/lib/utils/build-dashboard-data';

// Re-export pour les consommateurs existants du type via ce module.
export type { DashboardData };

// ============================================================
// Main Component
// ============================================================

export function DashboardPageClient({
  data,
  financials,
  previousFinancials,
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
  /** Valeurs M-1 calculees en live (fenetre precedente), comparables. */
  previousFinancials: PreviousPeriodFinancials;
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
  const evolutionData = buildEvolutionData(
    data,
    financials,
    previousFinancials,
    previousKpis,
  );

  // Chip "vs M-1" de la Production : production M-1 calculee en live
  // (avant : proxy snapshot total_facture_ht, comparaison heterogene).
  const productionTrend = computeEvolution(
    true,
    totalProduction,
    previousFinancials.production,
  );

  return (
    <div className="space-y-5">
      <DashboardAlerts
        alerts={alerts}
        totalProduction={totalProduction}
        totalFacture={totalFacture}
        totalEncaisse={totalEncaisse}
        totalProductionTtc={financials.totalProductionTtc}
        totalFactureTtc={financials.totalFactureTtc}
        totalEncaisseTtc={financials.totalEncaisseTtc}
        productionTrend={productionTrend}
        totalEnRetard={totalEnRetard}
        totalEnRetardTtc={financials.totalEnRetardTtc}
        totalAFacturer={totalAFacturer}
        totalAFacturerTtc={financials.totalAFacturerTtc}
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

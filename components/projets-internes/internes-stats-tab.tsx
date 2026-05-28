import Link from 'next/link';
import { MiniKpiCard } from '@/components/dashboard/mini-kpi-card';
import { CategorieBarChart } from './categorie-bar-chart';
import { CdpInternesTable } from './cdp-internes-table';
import { TendanceStackedChart } from './tendance-stacked-chart';
import type { StatsInternes } from '@/lib/queries/projets-internes';

interface Props {
  stats: StatsInternes;
  scope: 'moi' | 'equipe';
}

export function InternesStatsTab({ stats, scope }: Props) {
  const categoriesLabels: Record<string, string> = {};
  for (const c of stats.parCategorie) categoriesLabels[c.code] = c.libelle;

  const ratio = stats.ratioBillable.ratio;
  const delta = stats.ratioBillable.delta;

  const isEmpty = stats.totalHeures === 0;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniKpiCard
          label="Total heures internes"
          value={`${stats.totalHeures.toFixed(1)} h`}
          subtitle="Sur la période"
        />
        <MiniKpiCard
          label="Catégorie #1"
          value={stats.categorieTop?.libelle ?? '-'}
          subtitle={
            stats.categorieTop
              ? `${stats.categorieTop.heures.toFixed(1)} h · ${stats.categorieTop.pct.toFixed(1)}%`
              : 'Aucune donnée'
          }
        />
        <MiniKpiCard
          label="Ratio non-billable"
          value={ratio !== null ? `${ratio.toFixed(1)}%` : '-'}
          subtitle={
            delta !== null
              ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts vs n-1`
              : 'Pas de comparaison'
          }
        />
        {scope === 'equipe' ? (
          <MiniKpiCard
            label="Collaborateurs actifs"
            value={`${(stats.parCdp ?? []).filter((u) => u.heuresInternes > 0).length}`}
            subtitle="Avec heures internes"
          />
        ) : (
          <MiniKpiCard
            label="Mes heures client"
            value={`${stats.ratioBillable.heuresClient.toFixed(1)} h`}
            subtitle="Sur la même période"
          />
        )}
      </div>

      {isEmpty && (
        <div className="border-border bg-muted/30 rounded-lg border p-6 text-center">
          <p className="text-muted-foreground text-sm">
            Aucune saisie interne sur cette période.{' '}
            <Link
              href="/temps"
              className="text-primary underline-offset-2 hover:underline"
            >
              Saisir mon temps
            </Link>
          </p>
        </div>
      )}

      {/* Repartition par categorie */}
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">
          Répartition par catégorie
        </h2>
        <div className="border-border bg-card rounded-lg border p-4">
          <CategorieBarChart data={stats.parCategorie} />
        </div>
      </section>

      {/* Heures par CDP (equipe only) */}
      {scope === 'equipe' && stats.parCdp && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-tight">
            Heures par collaborateur
          </h2>
          <CdpInternesTable data={stats.parCdp} />
        </section>
      )}

      {/* Tendance 12 mois */}
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">
          Tendance 12 mois glissants
        </h2>
        <div className="border-border bg-card rounded-lg border p-4">
          <TendanceStackedChart
            data={stats.tendance12Mois}
            categoriesLabels={categoriesLabels}
          />
        </div>
      </section>
    </div>
  );
}

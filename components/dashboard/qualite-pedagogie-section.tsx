import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkline } from '@/components/shared/sparkline';
import { KpiCardPlaceholder } from './kpi-card-placeholder';
import { getLatestKpiValue, type Scope } from '@/lib/queries/kpi-history';

interface Props {
  scope: Scope;
  scopeId?: string | null;
}

function formatPercent(v: number | null): string {
  if (v === null) return '--';
  return `${v.toFixed(1).replace('.', ',')}%`;
}

async function KpiCard({
  title,
  kpiType,
  subtitle,
  color = 'blue',
  scope,
  scopeId,
}: {
  title: string;
  kpiType: string;
  subtitle: string;
  color?: 'green' | 'red' | 'blue';
  scope: Scope;
  scopeId?: string | null;
}) {
  const valeur = await getLatestKpiValue({ kpiType, scope, scopeId });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-bold">
          {formatPercent(valeur)}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>
        <div className="mt-3">
          <Sparkline
            kpiType={kpiType}
            scope={scope}
            scopeId={scopeId}
            color={color}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export async function QualitePedagogieSection({
  scope,
  scopeId = null,
}: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Qualite &amp; Pedagogie</h2>
        <p className="text-muted-foreground text-sm">
          Indicateurs §5 : sources Eduvia (contrats, progressions, Qualiopi).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="Qualite Qualiopi"
          kpiType="taux_qualiopi"
          subtitle="Taches conformes sur tous les CFA"
          color="green"
          scope={scope}
          scopeId={scopeId}
        />
        <KpiCard
          title="Pedagogie"
          kpiType="pedagogie_avancement"
          subtitle="Avancement moyen apprenants actifs"
          color="blue"
          scope={scope}
          scopeId={scopeId}
        />
        <KpiCardPlaceholder
          title="Reussite"
          tooltip="Donnees examens non disponibles cote Eduvia."
          subtitle="Taux de reussite examens (a venir)"
        />
        <KpiCard
          title="Financement"
          kpiType="taux_financement"
          subtitle="Part facturee vs NPEC total contrats actifs"
          color="blue"
          scope={scope}
          scopeId={scopeId}
        />
        <KpiCard
          title="Abandons"
          kpiType="taux_abandon"
          subtitle="Contrats resilies/annules sur 12 mois"
          color="red"
          scope={scope}
          scopeId={scopeId}
        />
        <KpiCardPlaceholder
          title="Rentabilite"
          tooltip="Couts directs non traces, formule a definir."
          subtitle="Marge brute (a venir)"
        />
      </div>
    </section>
  );
}

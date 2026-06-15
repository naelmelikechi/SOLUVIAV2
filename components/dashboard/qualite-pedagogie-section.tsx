import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SparklineSvg } from '@/components/shared/sparkline';
import { KpiCardPlaceholder } from './kpi-card-placeholder';
import {
  getKpiSeriesBatch,
  type Scope,
  type SparklinePoint,
} from '@/lib/queries/kpi-history';

interface Props {
  scope: Scope;
  scopeId?: string | null;
}

function formatPercent(v: number | null): string {
  if (v === null) return '--';
  return `${v.toFixed(1).replace('.', ',')}%`;
}

function KpiCard({
  title,
  subtitle,
  color = 'blue',
  series,
}: {
  title: string;
  subtitle: string;
  color?: 'green' | 'red' | 'blue';
  series: SparklinePoint[];
}) {
  const valeur = series.length > 0 ? series[series.length - 1]!.valeur : null;
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
          <SparklineSvg points={series} color={color} />
        </div>
      </CardContent>
    </Card>
  );
}

export async function QualitePedagogieSection({
  scope,
  scopeId = null,
}: Props) {
  const series = await getKpiSeriesBatch({
    kpiTypes: [
      'taux_qualiopi',
      'pedagogie_avancement',
      'taux_financement',
      'taux_abandon',
    ],
    scope,
    scopeId,
  });
  return (
    <section className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Qualite &amp; Pedagogie</h2>
          <Popover>
            <PopoverTrigger
              aria-label="Explication des calculs"
              className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-full p-0.5 transition-colors"
            >
              <Info className="size-4" />
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              className="w-[360px] text-xs"
            >
              <div className="space-y-2">
                <p className="text-foreground font-medium">
                  Calcul en multi-CFA
                </p>
                <p className="text-muted-foreground">
                  Aucun KPI n&apos;est une moyenne par CFA. Tout est agrege sur
                  le scope en sommant numerateurs et denominateurs bruts : un
                  gros CFA pese plus qu&apos;un petit.
                </p>
                <ul className="text-muted-foreground space-y-1.5 pl-1">
                  <li>
                    <span className="text-foreground font-medium">
                      Qualiopi
                    </span>{' '}
                    : livrables conform / livrables attendus (referentiel x nb
                    campus), tous CFA confondus.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">
                      Pedagogie
                    </span>{' '}
                    : moyenne des progressions saisies sur tous les contrats
                    actifs. Une progression = une saisie ponderee 1.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">
                      Financement
                    </span>{' '}
                    : montant HT facture / NPEC total des contrats actifs.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">
                      Abandons
                    </span>{' '}
                    : contrats resilies ou annules / total contrats (12 mois).
                  </li>
                </ul>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-muted-foreground text-sm">
          Indicateurs §5 : sources Eduvia (contrats, progressions, Qualiopi).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="Qualité Qualiopi"
          subtitle="Tâches conformes sur tous les CFA"
          color="green"
          series={series.get('taux_qualiopi') ?? []}
        />
        <KpiCard
          title="Pédagogie"
          subtitle="Avancement moyen apprenants actifs"
          color="blue"
          series={series.get('pedagogie_avancement') ?? []}
        />
        <KpiCardPlaceholder
          title="Réussite"
          tooltip="Données examens non disponibles côté Eduvia."
          subtitle="Taux de réussite examens (à venir)"
        />
        <KpiCard
          title="Financement"
          subtitle="Part facturée vs NPEC total contrats actifs"
          color="blue"
          series={series.get('taux_financement') ?? []}
        />
        <KpiCard
          title="Abandons"
          subtitle="Contrats resilies/annules sur 12 mois"
          color="red"
          series={series.get('taux_abandon') ?? []}
        />
        <KpiCardPlaceholder
          title="Rentabilité"
          tooltip="Coûts directs non tracés, formule à définir."
          subtitle="Marge brute (à venir)"
        />
      </div>
    </section>
  );
}

/**
 * Fallback de streaming pour <QualitePedagogieSection> : meme layout (titre +
 * grille 6 cartes) afin d'eviter tout saut de mise en page quand la section
 * (12+ requetes kpi_snapshots) arrive en streaming apres le shell du dashboard.
 */
export function QualitePedagogieSectionSkeleton() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Qualité &amp; Pédagogie</h2>
        <p className="text-muted-foreground text-sm">
          Indicateurs §5 : sources Eduvia (contrats, progressions, Qualiopi).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-36" />
              <Skeleton className="mt-3 h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

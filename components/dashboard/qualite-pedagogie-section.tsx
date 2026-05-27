import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Qualite &amp; Pedagogie</h2>
          <Popover>
            <PopoverTrigger
              aria-label="Explication des calculs"
              className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-full p-0.5 transition-colors"
            >
              <Info className="h-4 w-4" />
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

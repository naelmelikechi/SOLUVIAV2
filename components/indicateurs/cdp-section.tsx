import { Building2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { PeriodToggle } from '@/components/indicateurs/period-toggle';
import { CdpSectionTable } from '@/components/indicateurs/cdp-section-table';
import {
  getCdpSectionData,
  type IndicateursScope,
  type Period,
} from '@/lib/queries/indicateurs';

interface CdpSectionProps {
  scope: IndicateursScope;
  period: Period;
}

export async function CdpSection({ scope, period }: CdpSectionProps) {
  const rows = await getCdpSectionData(scope, period);

  // Recap calcule cote app a partir des rows deja chargees : aucune query
  // supplementaire. Permet au user de scanner les chiffres-cles avant de
  // plonger dans le tableau detaille.
  const totalCfa = rows.length;
  const progressionTotale = rows.reduce(
    (acc, r) => ({
      realise: acc.realise + r.progression.realise,
      total: acc.total + r.progression.total,
    }),
    { realise: 0, total: 0 },
  );
  const pctProgression =
    progressionTotale.total > 0
      ? Math.round((progressionTotale.realise / progressionTotale.total) * 100)
      : 0;
  const facturesRetardTotal = rows.reduce(
    (acc, r) => acc + (r.facturesEnRetard ?? 0),
    0,
  );
  const facturationTotale = rows.reduce(
    (acc, r) => ({
      realise: acc.realise + r.facturation.realise,
      total: acc.total + r.facturation.total,
    }),
    { realise: 0, total: 0 },
  );
  const pctFacturation =
    facturationTotale.total > 0
      ? Math.round((facturationTotale.realise / facturationTotale.total) * 100)
      : 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-foreground text-lg font-semibold">CDP</h2>
          <p className="text-muted-foreground text-sm">
            Suivi des CFA{' '}
            {scope.kind === 'admin' ? '(tous CDP)' : 'de votre portefeuille'}
          </p>
        </div>
        <PeriodToggle
          paramName="p"
          defaultValue="week"
          values={[
            { value: 'week', label: 'Hebdo' },
            { value: 'month', label: 'Mensuel' },
          ]}
        />
      </div>

      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-4">
          <RecapTile
            label="CFA suivis"
            value={String(totalCfa)}
            sub={totalCfa > 1 ? 'clients actifs' : 'client actif'}
          />
          <RecapTile
            label="Progression apprenants"
            value={`${pctProgression}%`}
            sub={`${progressionTotale.realise} / ${progressionTotale.total}`}
            tone={
              pctProgression >= 80
                ? 'good'
                : pctProgression >= 50
                  ? 'warn'
                  : 'bad'
            }
          />
          <RecapTile
            label="Facturation"
            value={`${pctFacturation}%`}
            sub={`${facturationTotale.realise} / ${facturationTotale.total}`}
            tone={
              pctFacturation >= 80
                ? 'good'
                : pctFacturation >= 50
                  ? 'warn'
                  : 'bad'
            }
          />
          <RecapTile
            label="Factures en retard"
            value={String(facturesRetardTotal)}
            sub="tous CFA confondus"
            tone={facturesRetardTotal === 0 ? 'good' : 'bad'}
          />
        </div>
      )}

      <Card className="py-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Aucun CFA à afficher"
            description="Aucun projet actif dans votre périmètre."
          />
        ) : (
          <CdpSectionTable rows={rows} />
        )}
      </Card>
    </section>
  );
}

function RecapTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const valueClass =
    tone === 'good'
      ? 'text-primary'
      : tone === 'warn'
        ? 'text-[var(--warning)]'
        : tone === 'bad'
          ? 'text-[var(--destructive)]'
          : 'text-foreground';
  return (
    <Card className="p-4">
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </div>
      <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div>
    </Card>
  );
}

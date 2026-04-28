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

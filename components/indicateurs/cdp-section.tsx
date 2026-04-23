import { Building2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { PeriodToggle } from '@/components/indicateurs/period-toggle';
import { RatioCell } from '@/components/indicateurs/ratio-cell';
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
          <Table>
            <TableHeader className="bg-muted/30 sticky top-0">
              <TableRow>
                <TableHead className="pl-4">CFA</TableHead>
                <TableHead>Progression apprenants</TableHead>
                <TableHead>RDV formateurs</TableHead>
                <TableHead>Tâches qualité</TableHead>
                <TableHead className="pr-4">Facturation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.clientId}>
                  <TableCell className="text-foreground pl-4 font-medium">
                    {row.clientNom}
                  </TableCell>
                  <TableCell>
                    <RatioCell
                      kind="progression"
                      realise={row.progression.realise}
                      total={row.progression.total}
                    />
                  </TableCell>
                  <TableCell>
                    <RatioCell
                      kind="rdv"
                      realise={row.rdvFormateurs.realise}
                      total={row.rdvFormateurs.total}
                    />
                  </TableCell>
                  <TableCell>
                    <RatioCell
                      kind="qualite"
                      realise={row.qualite.realise}
                      total={row.qualite.total}
                    />
                  </TableCell>
                  <TableCell className="pr-4">
                    <RatioCell
                      kind="facturation"
                      realise={row.facturation.realise}
                      total={row.facturation.total}
                      enRetard={row.facturesEnRetard}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </section>
  );
}

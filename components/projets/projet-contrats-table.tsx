import type { MockContrat } from '@/lib/mock-data';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const CONTRACT_STATE_LABELS: Record<string, string> = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  resilie: 'Resilie',
  termine: 'Termine',
};

const CONTRACT_STATE_COLORS: Record<string, string> = {
  actif: 'green',
  suspendu: 'orange',
  resilie: 'red',
  termine: 'gray',
};

function ProgressBar({
  value,
  comparison,
  color,
}: {
  value: number;
  comparison?: number;
  color: string;
}) {
  const isBelow = comparison !== undefined && value < comparison;
  const barColor = isBelow ? 'bg-[var(--warning)]' : color;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--border-light)]">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">
        {value}%
      </span>
    </div>
  );
}

export function ProjetContratsTable({ contrats }: { contrats: MockContrat[] }) {
  const actifs = contrats.filter((c) => c.contract_state === 'actif').length;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Contrats</h3>
          <span className="badge-orange rounded-full px-2 py-0.5 text-[10px] font-semibold">
            Eduvia
          </span>
        </div>
        <span className="text-muted-foreground text-sm">
          {actifs} contrat{actifs > 1 ? 's' : ''} actif{actifs > 1 ? 's' : ''}
        </span>
      </div>

      {contrats.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucun contrat synchronise
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Apprenant</TableHead>
                <TableHead>Formation</TableHead>
                <TableHead>Debut</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Prise en charge</TableHead>
                <TableHead>Prog. reelle</TableHead>
                <TableHead>Prog. theorique</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contrats.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="inline-block rounded bg-[var(--orange-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--warning)]">
                      {c.ref}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.apprenant_prenom} {c.apprenant_nom}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">
                    {c.formation_titre}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {formatDate(c.date_debut)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {formatDate(c.date_fin)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={CONTRACT_STATE_LABELS[c.contract_state]}
                      color={CONTRACT_STATE_COLORS[c.contract_state]}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatCurrency(c.montant_prise_en_charge)}
                  </TableCell>
                  <TableCell>
                    <ProgressBar
                      value={c.progression_reelle}
                      comparison={c.progression_theorique}
                      color="bg-primary"
                    />
                  </TableCell>
                  <TableCell>
                    <ProgressBar
                      value={c.progression_theorique}
                      color="bg-[var(--gray)]"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

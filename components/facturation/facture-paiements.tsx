import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { differenceInDays, parseISO } from 'date-fns';
import type { MockPaiement } from '@/lib/mock-data';

interface FacturePaiementsProps {
  paiements: MockPaiement[];
  statut: string;
  date_echeance: string;
}

export function FacturePaiements({
  paiements,
  statut,
  date_echeance,
}: FacturePaiementsProps) {
  const isEnRetard = statut === 'en_retard';
  const hasPaiements = paiements.length > 0;

  // Don't render anything if no payments and not overdue
  if (!hasPaiements && !isEnRetard) {
    return null;
  }

  const joursRetard = isEnRetard
    ? differenceInDays(new Date(), parseISO(date_echeance))
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">Paiements</h3>
        {isEnRetard && joursRetard > 0 && (
          <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {joursRetard} jour{joursRetard > 1 ? 's' : ''} de retard
          </span>
        )}
      </div>

      {hasPaiements ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date reception</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paiements.map((paiement) => (
              <TableRow key={paiement.id}>
                <TableCell>{formatDate(paiement.date_reception)}</TableCell>
                <TableCell className="font-mono">
                  {formatCurrency(paiement.montant)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {paiement.saisie_manuelle ? 'Saisie manuelle' : 'Odoo'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm">Aucun paiement recu</p>
      )}
    </div>
  );
}

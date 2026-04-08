import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils/formatters';
import type { MockFactureLigne } from '@/lib/mock-data';

interface FactureLignesTableProps {
  lignes: MockFactureLigne[];
  est_avoir: boolean;
}

export function FactureLignesTable({
  lignes,
  est_avoir,
}: FactureLignesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contrat</TableHead>
          <TableHead>Apprenant</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Montant HT</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lignes.map((ligne) => (
          <TableRow key={ligne.id}>
            <TableCell>
              <span className="font-mono text-orange-600 dark:text-orange-400">
                {ligne.contrat_ref}
              </span>
            </TableCell>
            <TableCell>{ligne.apprenant_nom}</TableCell>
            <TableCell className="text-muted-foreground">
              {ligne.description}
            </TableCell>
            <TableCell
              className={`text-right font-mono ${
                est_avoir ? 'text-red-600 dark:text-red-400' : ''
              }`}
            >
              {est_avoir ? '- ' : ''}
              {formatCurrency(ligne.montant_ht)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

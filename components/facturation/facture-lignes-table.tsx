'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import { formatCurrency } from '@/lib/utils/formatters';
import type { FactureDetail } from '@/lib/queries/factures';

interface FactureLignesTableProps {
  lignes: FactureDetail['lignes'];
  est_avoir: boolean;
}

export function FactureLignesTable({
  lignes,
  est_avoir,
}: FactureLignesTableProps) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () =>
      filterBySearch(lignes, search, (l) =>
        [
          l.contrat?.ref,
          l.contrat?.apprenant_prenom,
          l.contrat?.apprenant_nom,
          l.description,
        ]
          .filter(Boolean)
          .join(' '),
      ),
    [lignes, search],
  );

  return (
    <div className="space-y-3">
      <TableSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Rechercher une ligne..."
      />
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
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-muted-foreground h-12 text-center text-sm"
              >
                Aucun résultat.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((ligne) => (
              <TableRow key={ligne.id}>
                <TableCell>
                  <span className="font-mono text-orange-600 dark:text-orange-400">
                    {ligne.contrat?.ref ?? ''}
                  </span>
                </TableCell>
                <TableCell>
                  {ligne.contrat
                    ? `${ligne.contrat.apprenant_prenom ?? ''} ${ligne.contrat.apprenant_nom ?? ''}`.trim()
                    : ''}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {ligne.description}
                </TableCell>
                <TableCell
                  className={`text-right font-mono ${
                    est_avoir ? 'text-red-600 dark:text-red-400' : ''
                  }`}
                >
                  {formatCurrency(ligne.montant_ht)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

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
import { RatioCell } from '@/components/indicateurs/ratio-cell';

interface Row {
  clientId: string;
  clientNom: string;
  progression: { realise: number; total: number };
  rdvFormateurs: { realise: number; total: number };
  qualite: { realise: number; total: number };
  facturation: { realise: number; total: number };
  facturesEnRetard: number;
}

export function CdpSectionTable({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => filterBySearch(rows, search, (r) => r.clientNom),
    [rows, search],
  );

  return (
    <div className="space-y-3 p-3">
      <TableSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Rechercher un CFA..."
      />
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
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-muted-foreground h-12 text-center text-sm"
              >
                Aucun résultat.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((row) => (
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

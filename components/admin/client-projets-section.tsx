'use client';

import { useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';
import type { ClientProjet } from '@/lib/queries/clients';

export function ClientProjetsSection({ projets }: { projets: ClientProjet[] }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () =>
      filterBySearch(projets, search, (p) =>
        [
          p.ref,
          p.typologie?.libelle,
          p.cdp ? `${p.cdp.prenom} ${p.cdp.nom}` : '',
          STATUT_PROJET_LABELS[p.statut] || p.statut,
        ]
          .filter(Boolean)
          .join(' '),
      ),
    [projets, search],
  );

  return (
    <Card className="mb-6 p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <FolderOpen className="h-4 w-4" /> Projets associés
        <span className="text-muted-foreground text-xs font-normal">
          ({projets.length})
        </span>
      </h3>
      {projets.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun projet</p>
      ) : (
        <div className="space-y-3">
          <TableSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un projet..."
          />
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Typologie</TableHead>
                  <TableHead>CDP</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Statut</TableHead>
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
                  filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <ProjectRef ref_={p.ref ?? ''} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.typologie?.libelle ?? '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.cdp ? `${p.cdp.prenom} ${p.cdp.nom}` : '-'}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {p.taux_commission}%
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={STATUT_PROJET_LABELS[p.statut] || p.statut}
                          color={STATUT_PROJET_COLORS[p.statut] || 'gray'}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Card>
  );
}

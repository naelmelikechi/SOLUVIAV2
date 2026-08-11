'use client';

import { useMemo, useState, useTransition } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import {
  getContratStateColor,
  getContratStateLabel,
} from '@/lib/utils/contrat-states';
import {
  categorieContrat,
  CATEGORIES_CONTRAT,
  type CategorieContrat,
} from '@/lib/contrats/categories';
import { Undo2 } from 'lucide-react';
import { ContratDetailSheet } from '@/components/projets/contrat-detail-sheet';
import { desarchiverContrat } from '@/lib/actions/contrats-regles';
import type { ContratRowCategorise } from '@/lib/queries/projets';

interface Props {
  contrats: ContratRowCategorise[];
  /** Production SOLUVIA HT deja realisee avant la rupture, cle = contrat id. */
  productionAvantRupture: Record<string, number>;
  /** Nom de la regle d'archivage automatique, cle = archive_regle_id. */
  reglesNoms: Record<string, string>;
  /** Remettre un contrat en production est reserve aux admins. */
  estAdmin: boolean;
}

function refCell(c: ContratRowCategorise) {
  return (
    <span className="inline-block rounded bg-[var(--orange-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--warning)]">
      {c.contract_number ?? c.ref}
    </span>
  );
}

function apprenantCell(c: ContratRowCategorise) {
  return (
    <span className="text-sm">
      {c.apprenant_prenom} {c.apprenant_nom}
    </span>
  );
}

const refColumn: ColumnDef<ContratRowCategorise> = {
  id: 'ref',
  accessorFn: (c) =>
    [c.contract_number, c.internal_number, c.ref].filter(Boolean).join(' '),
  header: ({ column }) => <DataTableColumnHeader column={column} title="Réf" />,
  cell: ({ row }) => refCell(row.original),
};

const apprenantColumn: ColumnDef<ContratRowCategorise> = {
  id: 'apprenant',
  accessorFn: (c) => `${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''}`,
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Apprenant" />
  ),
  cell: ({ row }) => apprenantCell(row.original),
};

const formationColumn: ColumnDef<ContratRowCategorise> = {
  accessorKey: 'formation_titre',
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Formation" />
  ),
  cell: ({ row }) => (
    <span className="max-w-[220px] truncate text-sm">
      {row.original.formation_titre ?? '-'}
    </span>
  ),
};

const npecColumn: ColumnDef<ContratRowCategorise> = {
  accessorKey: 'npec_amount',
  header: ({ column }) => (
    <DataTableColumnHeader
      column={column}
      title="Prise en charge"
      className="justify-end"
    />
  ),
  cell: ({ row }) => (
    <div className="text-right font-mono text-sm tabular-nums">
      {row.original.npec_amount
        ? formatCurrency(row.original.npec_amount)
        : '-'}
    </div>
  ),
};

function dateColumn(
  id: 'date_debut' | 'date_fin' | 'date_rupture',
  title: string,
): ColumnDef<ContratRowCategorise> {
  return {
    accessorKey: id,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={title} />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original[id] ? formatDate(row.original[id] as string) : '-'}
      </span>
    ),
  };
}

const statutColumn: ColumnDef<ContratRowCategorise> = {
  id: 'statut',
  accessorFn: (c) => getContratStateLabel(c.contract_state),
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Statut" />
  ),
  cell: ({ row }) => (
    <StatusBadge
      label={getContratStateLabel(row.original.contract_state)}
      color={getContratStateColor(row.original.contract_state)}
    />
  ),
};

// Colonnes par categorie. Un jeu reduit par section - la densite est un
// critere explicite du commanditaire ("un truc aere, pas trop d'infos").
function columnsPour(
  cle: CategorieContrat,
  productionAvantRupture: Record<string, number>,
  reglesNoms: Record<string, string>,
  desarchiver: ((contrat: ContratRowCategorise) => void) | null,
): ColumnDef<ContratRowCategorise>[] {
  switch (cle) {
    case 'prevus':
      return [refColumn, apprenantColumn, formationColumn, npecColumn];
    case 'deposes':
      return [
        refColumn,
        apprenantColumn,
        formationColumn,
        statutColumn,
        npecColumn,
      ];
    case 'ruptures':
      return [
        refColumn,
        apprenantColumn,
        formationColumn,
        dateColumn('date_rupture', 'Rupture'),
        {
          id: 'production',
          accessorFn: (c) => productionAvantRupture[c.id] ?? 0,
          header: ({ column }) => (
            <DataTableColumnHeader
              column={column}
              title="Produit avant l'arrêt"
              className="justify-end"
            />
          ),
          cell: ({ row }) => (
            <div className="text-right font-mono text-sm tabular-nums">
              {formatCurrency(productionAvantRupture[row.original.id] ?? 0)}
            </div>
          ),
        },
      ];
    case 'annules':
      return [
        refColumn,
        apprenantColumn,
        formationColumn,
        dateColumn('date_debut', 'Début'),
      ];
    case 'archives': {
      const colonnes: ColumnDef<ContratRowCategorise>[] = [
        refColumn,
        apprenantColumn,
        formationColumn,
        {
          id: 'regle',
          accessorFn: (c) =>
            c.archive_regle_id
              ? (reglesNoms[c.archive_regle_id] ?? 'Règle supprimée')
              : 'Archivage manuel',
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Sorti par" />
          ),
          cell: ({ row }) => (
            <span className="text-sm">
              {row.original.archive_regle_id
                ? (reglesNoms[row.original.archive_regle_id] ??
                  'Règle supprimée')
                : 'Archivage manuel'}
            </span>
          ),
        },
        {
          id: 'archive_auto_le',
          accessorFn: (c) => c.archive_auto_le ?? '',
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Quand" />
          ),
          cell: ({ row }) => (
            <span className="text-sm tabular-nums">
              {row.original.archive_auto_le
                ? formatDate(row.original.archive_auto_le)
                : '-'}
            </span>
          ),
        },
      ];
      if (desarchiver) {
        colonnes.push({
          id: 'desarchiver',
          header: () => <span className="sr-only">Remettre en production</span>,
          cell: ({ row }) => (
            <div className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  // La ligne ouvre le detail du contrat : sans cet arret, le
                  // clic sur le bouton ouvrirait aussi le panneau.
                  e.stopPropagation();
                  desarchiver(row.original);
                }}
              >
                <Undo2 className="mr-1 size-3.5" />
                Remettre en production
              </Button>
            </div>
          ),
        });
      }
      return colonnes;
    }
  }
}

export function ProjetContratsCategories({
  contrats,
  productionAvantRupture,
  reglesNoms,
  estAdmin,
}: Props) {
  const [selectedContratId, setSelectedContratId] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function handleDesarchiver(contrat: ContratRowCategorise) {
    startTransition(async () => {
      const res = await desarchiverContrat(contrat.id);
      if (res.success) {
        toast.success('Contrat remis en production');
      } else {
        toast.error(res.error ?? 'Erreur');
      }
    });
  }

  const buckets = useMemo(() => {
    const parCle = new Map<CategorieContrat, ContratRowCategorise[]>(
      CATEGORIES_CONTRAT.map((c) => [c.cle, []]),
    );
    for (const c of contrats) {
      const cle = categorieContrat(c.contract_state, c.archive);
      parCle.get(cle)!.push(c);
    }
    return parCle;
  }, [contrats]);

  return (
    <div className="space-y-4">
      {CATEGORIES_CONTRAT.map((categorie) => {
        const rows = buckets.get(categorie.cle) ?? [];
        // Densite : une categorie vide n'affiche rien du tout, sauf les deux
        // premieres (Prevus, Deposes) dont l'absence est en soi une info -
        // un projet sans aucun contrat en attente ou depose merite d'etre vu.
        if (
          rows.length === 0 &&
          categorie.cle !== 'prevus' &&
          categorie.cle !== 'deposes'
        ) {
          return null;
        }

        return (
          <Card key={categorie.cle} className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-semibold">{categorie.label}</h3>
              {rows.length > 0 && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {rows.length}
                </span>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">{categorie.vide}</p>
            ) : (
              <DataTable
                columns={columnsPour(
                  categorie.cle,
                  productionAvantRupture,
                  reglesNoms,
                  estAdmin && !isPending ? handleDesarchiver : null,
                )}
                data={rows}
                searchPlaceholder="Rechercher un contrat..."
                paginationMode="auto"
                onRowClick={(c) => setSelectedContratId(c.id)}
                emptyMessage="Aucun résultat."
              />
            )}
          </Card>
        );
      })}
      <ContratDetailSheet
        contratId={selectedContratId}
        onOpenChange={(open) => !open && setSelectedContratId(null)}
      />
    </div>
  );
}

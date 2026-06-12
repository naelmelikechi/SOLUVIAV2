'use client';

import { useMemo, useState, useTransition } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { CategorieFormDialog } from './categorie-form-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { archiveCategorieInterneAction } from '@/app/(dashboard)/projets/internes/actions';
import { cn } from '@/lib/utils';
import type {
  CategorieInterne,
  ProjetInterneEnrichi,
} from '@/lib/queries/projets-internes';

interface Props {
  categories: CategorieInterne[];
  projets: ProjetInterneEnrichi[];
}

// oxlint-disable-next-line react-doctor/prefer-useReducer
export function InternesConfigTab({ categories, projets }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CategorieInterne | undefined>();
  const [filter, setFilter] = useState<'actif' | 'archive'>('actif');
  const [pendingArchiveId, startArchive] = useTransition();
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CategorieInterne | null>(
    null,
  );

  // Indexe les projets par categorie pour afficher les heures 12m
  const heuresParCategorie = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projets) {
      if (p.categorie) {
        map.set(
          p.categorie.id,
          (map.get(p.categorie.id) ?? 0) + p.heures_12mois,
        );
      }
    }
    return map;
  }, [projets]);

  const filtered = categories.filter((c) =>
    filter === 'actif' ? !c.archive : c.archive,
  );

  const handleArchiveConfirm = () => {
    if (!archiveTarget) return;
    const cat = archiveTarget;
    setArchivingId(cat.id);
    startArchive(async () => {
      const result = await archiveCategorieInterneAction(cat.id, cat.archive);
      setArchivingId(null);
      setArchiveTarget(null);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (result.data?.recentSaisies) {
        toast.warning(
          `Attention : ${result.data.recentSaisies} saisies dans les 30 derniers jours. Catégorie archivée quand même.`,
        );
      } else {
        toast.success(
          cat.archive ? 'Catégorie désarchivée' : 'Catégorie archivée',
        );
      }
    });
  };

  const columns = useMemo<ColumnDef<CategorieInterne>[]>(
    () => [
      {
        accessorKey: 'ordre',
        size: 64,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Ordre" />
        ),
        cell: ({ row }) => (
          <span
            className={cn('tabular-nums', row.original.archive && 'opacity-60')}
          >
            {row.original.ordre}
          </span>
        ),
      },
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Code" />
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              'text-muted-foreground font-mono text-xs',
              row.original.archive && 'opacity-60',
            )}
          >
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: 'libelle',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Libellé" />
        ),
        cell: ({ row }) => (
          <span
            className={cn('font-medium', row.original.archive && 'opacity-60')}
          >
            {row.original.libelle}
          </span>
        ),
      },
      {
        id: 'heures_12m',
        accessorFn: (c) => heuresParCategorie.get(c.id) ?? 0,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Heures 12m"
            className="justify-end"
          />
        ),
        cell: ({ getValue, row }) => (
          <div
            className={cn(
              'text-right tabular-nums',
              row.original.archive && 'opacity-60',
            )}
          >
            {getValue<number>().toFixed(1).replace('.', ',')} h
          </div>
        ),
      },
      {
        accessorKey: 'actif',
        size: 96,
        header: () => <div className="text-center">Actif</div>,
        cell: ({ row }) =>
          row.original.actif ? (
            <div className="text-center">
              <span className="inline-flex h-5 items-center rounded-full bg-emerald-50 px-2 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase">
                Actif
              </span>
            </div>
          ) : (
            <div className="text-center">
              <span className="text-muted-foreground inline-flex h-5 items-center rounded-full bg-gray-100 px-2 text-[10px] font-semibold tracking-wide uppercase">
                Inactif
              </span>
            </div>
          ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        size: 128,
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="text-right">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(c)}
                disabled={c.archive}
              >
                Éditer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setArchiveTarget(c)}
                disabled={pendingArchiveId && archivingId === c.id}
              >
                {c.archive ? 'Désarchiver' : 'Archiver'}
              </Button>
            </div>
          );
        },
      },
    ],
    [heuresParCategorie, pendingArchiveId, archivingId],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="bg-muted/30 border-border inline-flex items-center rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setFilter('actif')}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              filter === 'actif'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Actives ({categories.filter((c) => !c.archive).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('archive')}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              filter === 'archive'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Archivées ({categories.filter((c) => c.archive).length})
          </button>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          + Nouvelle catégorie
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="Rechercher une catégorie..."
        paginationMode="auto"
        defaultSort={{ id: 'ordre', desc: false }}
        emptyMessage={
          filter === 'actif'
            ? 'Aucune catégorie active'
            : 'Aucune catégorie archivée'
        }
      />

      <CategorieFormDialog open={showCreate} onOpenChange={setShowCreate} />
      {editing && (
        <CategorieFormDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(undefined)}
          categorie={editing}
        />
      )}

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={
          archiveTarget?.archive
            ? 'Désarchiver la catégorie'
            : 'Archiver la catégorie'
        }
        description={
          archiveTarget
            ? `Confirmer ${archiveTarget.archive ? 'désarchiver' : 'archiver'} la catégorie "${archiveTarget.libelle}" ?`
            : ''
        }
        confirmText={archiveTarget?.archive ? 'Désarchiver' : 'Archiver'}
        variant={archiveTarget?.archive ? 'default' : 'destructive'}
        onConfirm={handleArchiveConfirm}
        isPending={archivingId !== null}
      />
    </div>
  );
}

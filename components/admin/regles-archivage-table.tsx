'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState, useTransition } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import {
  upsertRegleArchivage,
  deleteRegleArchivage,
} from '@/lib/actions/contrats-regles';
import { RegleArchivageFormDialog } from '@/components/admin/regle-archivage-form-dialog';
import { getContratStateLabel } from '@/lib/utils/contrat-states';
import type { RegleArchivageRow } from '@/lib/queries/contrats-regles';

export function ReglesArchivageTable({
  regles,
}: {
  regles: RegleArchivageRow[];
}) {
  const [editTarget, setEditTarget] = useState<RegleArchivageRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RegleArchivageRow | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function handleToggleActif(regle: RegleArchivageRow) {
    startTransition(async () => {
      const res = await upsertRegleArchivage({
        id: regle.id,
        nom: regle.nom,
        etat_source: regle.etat_source,
        delai_jours: regle.delai_jours,
        actif: !regle.actif,
      });
      if (res.success) {
        toast.success(regle.actif ? 'Règle désactivée' : 'Règle activée');
      } else {
        toast.error(res.error ?? 'Erreur');
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await deleteRegleArchivage(deleteTarget.id);
      if (res.success) {
        toast.success('Règle supprimée');
        setDeleteTarget(null);
      } else {
        toast.error(res.error ?? 'Erreur');
      }
    });
  }

  const columns = useMemo<ColumnDef<RegleArchivageRow>[]>(
    () => [
      {
        accessorKey: 'nom',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Nom" />
        ),
        cell: ({ row }) => (
          <span
            className={
              row.original.actif ? 'font-medium' : 'font-medium opacity-60'
            }
          >
            {row.original.nom}
          </span>
        ),
      },
      {
        accessorKey: 'etat_source',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="État source" />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary" className="font-mono text-xs">
            {getContratStateLabel(row.original.etat_source)}
          </Badge>
        ),
      },
      {
        accessorKey: 'delai_jours',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Délai" />
        ),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.delai_jours} j
          </span>
        ),
      },
      {
        id: 'nbContratsArchives',
        accessorFn: (r) => r.nbContratsArchives,
        meta: {
          label: 'Déjà archivés',
          aggregate: 'sum',
          aggregateFormat: (v) => Math.round(v).toLocaleString('fr-FR'),
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Déjà archivés" />
        ),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.nbContratsArchives}
          </span>
        ),
      },
      {
        accessorKey: 'actif',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Statut" />
        ),
        cell: ({ row }) => (
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleToggleActif(row.original)}
            className={
              row.original.actif
                ? 'text-green-600 dark:text-green-400'
                : 'text-muted-foreground'
            }
          >
            {row.original.actif ? 'Active' : 'Désactivée'}
          </button>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditTarget(row.original)}
              aria-label="Modifier"
              title="Modifier"
            >
              <Edit className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Supprimer"
              title="Supprimer"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [isPending],
  );

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {/* Espace dans l'expression : Turbopack perd l'espace d'un texte JSX
              à entité (&apos;) qui suit une expression. */}
          {regles.length} règle{regles.length > 1 ? 's' : ''}
          {" d'archivage"}
        </h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 size-3.5" /> Nouvelle règle
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={regles}
        searchPlaceholder="Rechercher une règle..."
        paginationMode="auto"
        emptyMessage="Aucune règle d'archivage configurée."
      />

      <RegleArchivageFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        regle={null}
      />
      <RegleArchivageFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        regle={editTarget}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Supprimer cette règle ?"
        description={
          deleteTarget
            ? `La règle "${deleteTarget.nom}" sera supprimée. Les contrats déjà archivés par cette règle le restent, mais perdent la trace de la règle qui les a sortis.`
            : ''
        }
        confirmText="Supprimer"
        variant="destructive"
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </Card>
  );
}

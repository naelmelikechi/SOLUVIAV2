'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState, useTransition } from 'react';
import { Plus, Edit, Archive, ArchiveRestore } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { toast } from 'sonner';
import { archiveOpco, unarchiveOpco } from '@/lib/actions/opcos';
import { OpcoFormDialog } from '@/components/admin/opco-form-dialog';
import type { OpcoRow } from '@/lib/queries/opcos';

export function OpcosSection({ opcos }: { opcos: OpcoRow[] }) {
  const [editTarget, setEditTarget] = useState<OpcoRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleArchive(id: string, currentActif: boolean) {
    startTransition(async () => {
      const res = currentActif
        ? await archiveOpco(id)
        : await unarchiveOpco(id);
      if (res.success)
        toast.success(currentActif ? 'OPCO archivé' : 'OPCO réactivé');
      else toast.error(res.error ?? 'Erreur');
    });
  }

  const columns = useMemo<ColumnDef<OpcoRow>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Code" />
        ),
        cell: ({ row }) => (
          <span
            className={`font-mono font-semibold ${!row.original.actif ? 'opacity-60' : ''}`}
          >
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: 'nom',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Nom" />
        ),
        cell: ({ row }) => (
          <span className={!row.original.actif ? 'opacity-60' : ''}>
            {row.original.nom}
          </span>
        ),
      },
      {
        id: 'idcc',
        accessorFn: (row) => row.idcc_codes.length,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="IDCC" />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary" className="font-mono text-xs">
            {row.original.idcc_codes.length} IDCC
          </Badge>
        ),
      },
      {
        accessorKey: 'actif',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Statut" />
        ),
        cell: ({ row }) => (
          <span
            className={
              row.original.actif
                ? 'text-green-600 dark:text-green-400'
                : 'text-muted-foreground'
            }
          >
            {row.original.actif ? 'Actif' : 'Archivé'}
          </span>
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
              disabled={isPending}
              onClick={() => handleArchive(row.original.id, row.original.actif)}
              aria-label={row.original.actif ? 'Archiver' : 'Réactiver'}
              title={row.original.actif ? 'Archiver' : 'Réactiver'}
            >
              {row.original.actif ? (
                <Archive className="size-3.5" />
              ) : (
                <ArchiveRestore className="size-3.5" />
              )}
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
          {opcos.length} OPCO référencés
        </h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 size-3.5" /> Nouvel OPCO
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={opcos}
        searchPlaceholder="Rechercher un OPCO..."
        paginationMode="auto"
        emptyMessage="Aucun OPCO configuré."
      />

      <OpcoFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        opco={null}
      />
      <OpcoFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        opco={editTarget}
      />
    </Card>
  );
}

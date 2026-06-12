'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LigneEditDialog, type LigneEditMode } from './ligne-edit-dialog';
import { formatCurrency } from '@/lib/utils/formatters';
import { removeLigneFromBrouillon } from '@/lib/actions/facture-lignes';
import type { FactureDetail } from '@/lib/queries/factures';

type FactureLigne = FactureDetail['lignes'][number];

interface FactureLignesTableProps {
  lignes: FactureDetail['lignes'];
  est_avoir: boolean;
  factureId: string;
  projetId: string;
  isBrouillon: boolean;
  tauxCommission: number;
}

export function FactureLignesTable({
  lignes,
  est_avoir,
  factureId,
  projetId,
  isBrouillon,
  tauxCommission,
}: FactureLignesTableProps) {
  const { refresh } = useRouter();
  const [editConfig, setEditConfig] = useState<LigneEditMode | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function openAddDialog() {
    setEditConfig({
      mode: 'add',
      factureId,
      projetId,
      estAvoir: est_avoir,
      defaultTauxCommission: tauxCommission,
    });
    setEditOpen(true);
  }

  function openEditDialog(ligne: FactureLigne) {
    setEditConfig({
      mode: 'edit',
      ligneId: ligne.id,
      initialDescription: ligne.description ?? '',
      initialMontantHt: Number(ligne.montant_ht ?? 0),
      estAvoir: est_avoir,
    });
    setEditOpen(true);
  }

  function handleDeleteConfirm() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    startDelete(async () => {
      const result = await removeLigneFromBrouillon(id);
      if (!result.success) {
        toast.error(result.error ?? 'Erreur lors de la suppression');
        return;
      }
      toast.success('Ligne supprimée');
      if (result.eventFreed) {
        toast.info('Événement Eduvia libéré, à nouveau facturable');
      }
      setPendingDeleteId(null);
      refresh();
    });
  }

  const columns = useMemo<ColumnDef<FactureLigne>[]>(() => {
    const base: ColumnDef<FactureLigne>[] = [
      {
        id: 'contrat',
        accessorFn: (l) => l.contrat?.ref ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Contrat" />
        ),
        cell: ({ getValue }) => (
          <span className="font-mono text-orange-600 dark:text-orange-400">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'apprenant',
        accessorFn: (l) =>
          l.contrat
            ? `${l.contrat.apprenant_prenom ?? ''} ${l.contrat.apprenant_nom ?? ''}`.trim()
            : '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Apprenant" />
        ),
        cell: ({ getValue }) => getValue<string>(),
      },
      {
        accessorKey: 'description',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Description" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.description}
          </span>
        ),
      },
      {
        accessorKey: 'montant_ht',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Montant HT"
            className="justify-end"
          />
        ),
        cell: ({ row }) => (
          <div
            className={`text-right font-mono ${
              est_avoir ? 'text-red-600 dark:text-red-400' : ''
            }`}
          >
            {formatCurrency(row.original.montant_ht)}
          </div>
        ),
      },
    ];
    if (isBrouillon) {
      base.push({
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        size: 100,
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Modifier la ligne"
                    onClick={() => openEditDialog(row.original)}
                  />
                }
              >
                <Pencil className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="top">Modifier</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Supprimer la ligne"
                    onClick={() => setPendingDeleteId(row.original.id)}
                  />
                }
              >
                <Trash2 className="size-4 text-red-600 dark:text-red-400" />
              </TooltipTrigger>
              <TooltipContent side="top">Supprimer</TooltipContent>
            </Tooltip>
          </div>
        ),
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est_avoir, isBrouillon, factureId, projetId, tauxCommission]);

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-3">
        <DataTable
          columns={columns}
          data={lignes}
          searchPlaceholder="Rechercher une ligne..."
          paginationMode="auto"
          emptyMessage="Aucun résultat."
          toolbarExtra={
            isBrouillon ? (
              <Button
                variant="outline"
                size="sm"
                onClick={openAddDialog}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Ajouter une ligne
              </Button>
            ) : undefined
          }
        />

        {editConfig && (
          <LigneEditDialog
            open={editOpen}
            onOpenChange={(o) => {
              setEditOpen(o);
              if (!o) setEditConfig(null);
            }}
            config={editConfig}
            onSuccess={() => refresh()}
          />
        )}

        <ConfirmDialog
          open={pendingDeleteId !== null}
          onOpenChange={(o) => {
            if (!o) setPendingDeleteId(null);
          }}
          title="Supprimer la ligne"
          description="Cette action est définitive. Si la ligne provenait d'un événement Eduvia, il sera à nouveau facturable."
          confirmText="Supprimer"
          variant="destructive"
          onConfirm={handleDeleteConfirm}
          isPending={isDeleting}
        />
      </div>
    </TooltipProvider>
  );
}

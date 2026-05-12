'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LigneEditDialog, type LigneEditMode } from './ligne-edit-dialog';
import { formatCurrency } from '@/lib/utils/formatters';
import { removeLigneFromBrouillon } from '@/lib/actions/facture-lignes';
import type { FactureDetail } from '@/lib/queries/factures';

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
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [editConfig, setEditConfig] = useState<LigneEditMode | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

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

  const colSpan = isBrouillon ? 5 : 4;

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

  function openEditDialog(ligne: FactureDetail['lignes'][number]) {
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
      router.refresh();
    });
  }

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <TableSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher une ligne..."
          />
          {isBrouillon && (
            <Button
              variant="outline"
              size="sm"
              onClick={openAddDialog}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Ajouter une ligne
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contrat</TableHead>
              <TableHead>Apprenant</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Montant HT</TableHead>
              {isBrouillon && (
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
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
                  {isBrouillon && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Modifier la ligne"
                                onClick={() => openEditDialog(ligne)}
                              />
                            }
                          >
                            <Pencil className="h-4 w-4" />
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
                                onClick={() => setPendingDeleteId(ligne.id)}
                              />
                            }
                          >
                            <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </TooltipTrigger>
                          <TooltipContent side="top">Supprimer</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {editConfig && (
          <LigneEditDialog
            open={editOpen}
            onOpenChange={(o) => {
              setEditOpen(o);
              if (!o) setEditConfig(null);
            }}
            config={editConfig}
            onSuccess={() => router.refresh()}
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

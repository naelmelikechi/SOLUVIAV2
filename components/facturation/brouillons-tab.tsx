'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, FileText, Loader2, Send, Trash2, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import {
  deleteBrouillon,
  sendFacture,
  sendFacturesBulk,
} from '@/lib/actions/factures';
import type { BrouillonItem } from '@/lib/queries/factures';

interface BrouillonsTabProps {
  brouillons: BrouillonItem[];
}

export function BrouillonsTab({ brouillons }: BrouillonsTabProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [previewBrouillon, setPreviewBrouillon] =
    useState<BrouillonItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BrouillonItem | null>(
    null,
  );
  const [bulkPending, startBulkTransition] = useTransition();
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [rowAction, setRowAction] = useState<'send' | 'delete' | null>(null);

  const filtered = useMemo(
    () =>
      filterBySearch(brouillons, search, (b) =>
        [
          b.client?.raison_sociale,
          b.client?.trigramme,
          b.projet?.ref,
          b.mois_concerne,
          b.est_avoir ? 'avoir' : 'facture',
          formatCurrency(b.montant_ttc),
        ]
          .filter(Boolean)
          .join(' '),
      ),
    [brouillons, search],
  );

  const allSelected =
    filtered.length > 0 && filtered.every((b) => selectedIds.has(b.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((b) => b.id)));
    }
  }, [allSelected, filtered]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSendOne = (id: string) => {
    setRowPendingId(id);
    setRowAction('send');
    startBulkTransition(async () => {
      const result = await sendFacture(id);
      setRowPendingId(null);
      setRowAction(null);
      if (result.success) {
        toast.success(
          result.ref
            ? `Envoyé : ${result.ref}`
            : 'Brouillon envoyé avec succès',
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        router.refresh();
      } else {
        toast.error(result.error ?? "Erreur lors de l'envoi");
      }
    });
  };

  const handleSendBulk = (ids: string[]) => {
    if (ids.length === 0) return;
    startBulkTransition(async () => {
      const result = await sendFacturesBulk(ids);
      const sentCount = result.sent.length;
      const errorCount = result.errors.length;

      if (sentCount > 0 && errorCount === 0) {
        const refs = result.sent.map((s) => s.ref).join(', ');
        toast.success(
          sentCount === 1
            ? `Envoyé : ${refs}`
            : `${sentCount} brouillons envoyés (${refs})`,
        );
      } else if (sentCount > 0 && errorCount > 0) {
        toast.warning(
          `${sentCount} envoyé${sentCount > 1 ? 's' : ''}, ${errorCount} en erreur`,
        );
        for (const e of result.errors) {
          toast.error(e.error);
        }
      } else {
        toast.error('Aucun brouillon envoyé');
        for (const e of result.errors) {
          toast.error(e.error);
        }
      }
      setSelectedIds(new Set());
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    setRowPendingId(id);
    setRowAction('delete');
    startBulkTransition(async () => {
      const result = await deleteBrouillon(id);
      setRowPendingId(null);
      setRowAction(null);
      setConfirmDelete(null);
      if (result.success) {
        toast.success('Brouillon supprimé');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        router.refresh();
      } else {
        toast.error(result.error ?? 'Erreur lors de la suppression');
      }
    });
  };

  if (brouillons.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Aucun brouillon"
        description={
          'Les brouillons apparaitront ici apres avoir prepare les factures depuis l’onglet Échéances.'
        }
      />
    );
  }

  const selectedIdsArray = Array.from(selectedIds);
  const allIds = brouillons.map((b) => b.id);

  return (
    <TooltipProvider delay={200}>
      <div className="flex flex-col gap-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TableSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un brouillon..."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0 || bulkPending}
              onClick={() => handleSendBulk(selectedIdsArray)}
            >
              {bulkPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              {`Envoyer la sélection (${selectedIds.size})`}
            </Button>
            <Button
              size="sm"
              disabled={brouillons.length === 0 || bulkPending}
              onClick={() => handleSendBulk(allIds)}
            >
              {bulkPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              {'Tout envoyer'}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Tout sélectionner"
                  />
                </TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Projet</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>{'Mois concerné'}</TableHead>
                <TableHead className="text-right">Montant TTC</TableHead>
                <TableHead className="text-right">Lignes</TableHead>
                <TableHead>{'Créé le'}</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-muted-foreground h-16 text-center text-sm"
                  >
                    {'Aucun résultat.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((b) => {
                  const isRowPending = rowPendingId === b.id;
                  const projetRef = b.projet?.ref ?? '';
                  const clientName = b.client?.raison_sociale ?? '-';
                  const lignesCount = b.lignes?.length ?? 0;
                  const isSendingRow = isRowPending && rowAction === 'send';
                  const isDeletingRow = isRowPending && rowAction === 'delete';

                  return (
                    <TableRow
                      key={b.id}
                      data-state={
                        selectedIds.has(b.id) ? 'selected' : undefined
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(b.id)}
                          onCheckedChange={() => toggleOne(b.id)}
                          aria-label={`Sélectionner brouillon ${clientName}`}
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{clientName}</span>
                          {b.client?.trigramme ? (
                            <span className="text-muted-foreground font-mono text-xs">
                              {b.client.trigramme}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {projetRef ? (
                          <Link
                            href={`/projets/${projetRef}`}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="inline-block rounded bg-[var(--primary-bg)] px-2 py-0.5 font-mono text-xs font-semibold">
                              {projetRef}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {'—'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {b.est_avoir ? (
                          <StatusBadge label="Avoir" color="orange" />
                        ) : (
                          <StatusBadge label="Facture" color="blue" />
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {b.mois_concerne}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        <span
                          className={b.est_avoir ? 'text-[var(--warning)]' : ''}
                        >
                          {formatCurrency(b.montant_ttc)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right font-mono text-xs tabular-nums">
                        {lignesCount}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm tabular-nums">
                        {b.created_at ? formatDate(b.created_at) : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Aperçu"
                                  onClick={() => setPreviewBrouillon(b)}
                                  disabled={bulkPending}
                                />
                              }
                            >
                              <Eye className="h-4 w-4" />
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {'Aperçu'}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Envoyer ce brouillon"
                                  onClick={() => handleSendOne(b.id)}
                                  disabled={bulkPending}
                                />
                              }
                            >
                              {isSendingRow ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4 text-[var(--primary)]" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent side="top">Envoyer</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Supprimer ce brouillon"
                                  onClick={() => setConfirmDelete(b)}
                                  disabled={bulkPending}
                                />
                              }
                            >
                              {isDeletingRow ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-[var(--destructive)]" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              Supprimer
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Preview Sheet (TODO: PDF preview une fois l'API /api/factures/brouillons/{id}/pdf-preview dispo) */}
      <Sheet
        open={previewBrouillon !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewBrouillon(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          {previewBrouillon ? (
            <BrouillonPreview brouillon={previewBrouillon} />
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Supprimer ce brouillon ?"
        description={
          'Cette action est définitive. Les échéances rattachées seront réouvertes (si applicable). Aucun numéro de facture ne sera consommé.'
        }
        confirmText="Supprimer"
        variant="destructive"
        isPending={
          rowAction === 'delete' &&
          rowPendingId !== null &&
          rowPendingId === confirmDelete?.id
        }
        onConfirm={() => {
          if (confirmDelete) handleDelete(confirmDelete.id);
        }}
      />
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// BrouillonPreview - Sheet d'apercu listant les lignes du brouillon.
// ---------------------------------------------------------------------------
// TODO: remplacer par une vraie preview PDF (composant FacturePdf rendu
// cote client) des qu'un endpoint /api/factures/brouillons/{id}/pdf-preview
// est disponible.
function BrouillonPreview({ brouillon }: { brouillon: BrouillonItem }) {
  const lignes = brouillon.lignes ?? [];
  const totalLignesHt = lignes.reduce((s, l) => s + (l.montant_ht ?? 0), 0);

  return (
    <div className="flex flex-col gap-4 p-6">
      <SheetHeader className="p-0">
        <SheetTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {brouillon.est_avoir
            ? 'Aperçu brouillon - Avoir'
            : 'Aperçu brouillon - Facture'}
        </SheetTitle>
        <SheetDescription>
          {'Brouillon non envoyé. Les numéros sont attribués à l’envoi.'}
        </SheetDescription>
      </SheetHeader>

      <div className="border-border grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm">
        <div className="text-muted-foreground">Client</div>
        <div className="text-right font-medium">
          {brouillon.client?.raison_sociale ?? '-'}
        </div>
        <div className="text-muted-foreground">Projet</div>
        <div className="text-right font-mono text-xs">
          {brouillon.projet?.ref ?? '-'}
        </div>
        <div className="text-muted-foreground">{'Mois concerné'}</div>
        <div className="text-right">{brouillon.mois_concerne}</div>
        <div className="text-muted-foreground">{'Date d’émission'}</div>
        <div className="text-right tabular-nums">
          {brouillon.date_emission ? formatDate(brouillon.date_emission) : '—'}
        </div>
        <div className="text-muted-foreground">Montant HT</div>
        <div className="text-right font-mono tabular-nums">
          {formatCurrency(brouillon.montant_ht)}
        </div>
        <div className="text-muted-foreground">
          {'TVA ('}
          {brouillon.taux_tva}
          {' %)'}
        </div>
        <div className="text-right font-mono tabular-nums">
          {formatCurrency(brouillon.montant_tva)}
        </div>
        <div className="text-foreground font-semibold">Total TTC</div>
        <div className="text-right font-mono font-semibold tabular-nums">
          {formatCurrency(brouillon.montant_ttc)}
        </div>
      </div>

      {brouillon.est_avoir && brouillon.avoir_motif ? (
        <div className="border-border rounded-lg border p-3 text-sm">
          <div className="text-muted-foreground mb-1 text-xs">
            {'Motif de l’avoir'}
          </div>
          <div>{brouillon.avoir_motif}</div>
        </div>
      ) : null}

      <div>
        <h4 className="mb-2 text-sm font-semibold">
          {`Lignes (${lignes.length})`}
        </h4>
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Montant HT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="text-muted-foreground h-16 text-center text-sm"
                  >
                    {'Aucune ligne.'}
                  </TableCell>
                </TableRow>
              ) : (
                lignes.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">
                      <div>{l.description}</div>
                      {l.contrat ? (
                        <div className="text-muted-foreground mt-0.5 text-xs">
                          {[
                            l.contrat.contract_number ?? l.contrat.ref,
                            [
                              l.contrat.apprenant_prenom,
                              l.contrat.apprenant_nom,
                            ]
                              .filter(Boolean)
                              .join(' '),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(l.montant_ht ?? 0)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {lignes.length > 0 ? (
              <tfoot>
                <tr className="border-border border-t">
                  <td className="p-2 text-right text-sm font-medium">
                    Total HT
                  </td>
                  <td className="p-2 text-right font-mono text-sm font-semibold tabular-nums">
                    {formatCurrency(totalLignesHt)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </Table>
        </div>
      </div>
    </div>
  );
}

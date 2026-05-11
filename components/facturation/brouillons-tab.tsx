'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Download,
  Eye,
  Loader2,
  Send,
  Trash2,
  Inbox,
} from 'lucide-react';
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
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
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

// Retourne la liste (dedupliquee) des refs contrats sans DECA OPCO presents
// dans un brouillon. Si non vide, l'emission est bloquee cote serveur et le
// bouton Envoyer est desactive cote UI.
function getMissingDecaRefs(b: BrouillonItem): string[] {
  const refs = new Set<string>();
  for (const l of b.lignes ?? []) {
    const c = l.contrat;
    if (!c) continue;
    if (!c.contract_number || c.contract_number.trim() === '') {
      if (c.ref) refs.add(c.ref);
    }
  }
  return Array.from(refs);
}

export function BrouillonsTab({ brouillons }: BrouillonsTabProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [previewBrouillon, setPreviewBrouillon] =
    useState<BrouillonItem | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
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
                <TableHead className="w-32">Actions</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Projet</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>{'Mois concerné'}</TableHead>
                <TableHead className="text-right">Montant TTC</TableHead>
                <TableHead className="text-right">Lignes</TableHead>
                <TableHead>{'Créé le'}</TableHead>
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
                  const missingDecaRefs = getMissingDecaRefs(b);
                  const hasMissingDeca = missingDecaRefs.length > 0;

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
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Aperçu"
                                  onClick={() => {
                                    setPreviewLoaded(false);
                                    setPreviewBrouillon(b);
                                  }}
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
                                  disabled={bulkPending || hasMissingDeca}
                                />
                              }
                            >
                              {isSendingRow ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4 text-[var(--primary)]" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {hasMissingDeca
                                ? `Envoi bloqué - DECA manquant sur ${missingDecaRefs.length} contrat${missingDecaRefs.length > 1 ? 's' : ''} (${missingDecaRefs.join(', ')})`
                                : 'Envoyer'}
                            </TooltipContent>
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
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span className="font-medium">{clientName}</span>
                            {b.client?.trigramme ? (
                              <span className="text-muted-foreground font-mono text-xs">
                                {b.client.trigramme}
                              </span>
                            ) : null}
                          </div>
                          {hasMissingDeca && (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <span
                                    aria-label={`DECA manquant sur ${missingDecaRefs.length} contrat${missingDecaRefs.length > 1 ? 's' : ''}`}
                                    className="inline-flex items-center gap-1 rounded bg-[var(--warning)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warning)]"
                                  />
                                }
                              >
                                <AlertTriangle className="h-3 w-3" />
                                DECA
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                {`DECA OPCO manquant sur ${missingDecaRefs.length} contrat${missingDecaRefs.length > 1 ? 's' : ''} (${missingDecaRefs.join(', ')}). Renseignez le DECA dans Eduvia, attendez la synchro, puis envoyez.`}
                              </TooltipContent>
                            </Tooltip>
                          )}
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
                            {'-'}
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
                        {b.created_at ? formatDate(b.created_at) : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Preview Sheet : PDF brouillon rendu via /api/factures/brouillon/[id]/pdf */}
      <Sheet
        open={previewBrouillon !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewBrouillon(null);
            setPreviewLoaded(false);
          }
        }}
      >
        <SheetContent
          side="right"
          className="flex !w-[min(800px,95vw)] flex-col gap-0 p-0 data-[side=right]:sm:max-w-[min(800px,95vw)]"
        >
          <SheetHeader className="border-border flex flex-row items-center justify-between border-b p-4 pr-12">
            <SheetTitle>
              {previewBrouillon?.est_avoir
                ? 'Aperçu brouillon - Avoir'
                : 'Aperçu brouillon - Facture'}
            </SheetTitle>
            {previewBrouillon ? (
              <a
                href={`/api/factures/brouillon/${previewBrouillon.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Download className="mr-1.5 h-4 w-4" />
                {'Télécharger'}
              </a>
            ) : null}
          </SheetHeader>
          {previewBrouillon ? (
            <div className="relative flex-1">
              {!previewLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                  <p className="text-muted-foreground text-sm">
                    {'Chargement du brouillon...'}
                  </p>
                </div>
              )}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
              <iframe
                key={previewBrouillon.id}
                src={`/api/factures/brouillon/${previewBrouillon.id}/pdf?inline=true`}
                title={'Aperçu brouillon'}
                onLoad={() => setPreviewLoaded(true)}
                className="absolute inset-0 h-full w-full border-0 bg-white"
              />
            </div>
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

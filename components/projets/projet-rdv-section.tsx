'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  CalendarDays,
  Plus,
  CheckCircle,
  XCircle,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { formatDate } from '@/lib/utils/formatters';
import { STATUT_RDV_LABELS, STATUT_RDV_COLORS } from '@/lib/utils/constants';
import {
  createRdvFormateur,
  updateRdvFormateurStatut,
  deleteRdvFormateur,
} from '@/lib/actions/rdv';
import { toast } from 'sonner';
import type { RdvFormateurWithRefs } from '@/lib/queries/rdv';

interface ProjetRdvSectionProps {
  projetId: string;
  rdvs: RdvFormateurWithRefs[];
}

export function ProjetRdvSection({ projetId, rdvs }: ProjetRdvSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      filterBySearch(rdvs, search, (r) =>
        [
          r.formateur
            ? `${r.formateur.prenom} ${r.formateur.nom}`
            : r.formateur_nom,
          r.objet,
          STATUT_RDV_LABELS[r.statut],
        ]
          .filter(Boolean)
          .join(' '),
      ),
    [rdvs, search],
  );

  function handleToggleStatut(id: string, current: string) {
    setPendingId(id);
    startTransition(async () => {
      const next = current === 'realise' ? 'prevu' : 'realise';
      const r = await updateRdvFormateurStatut(id, next);
      setPendingId(null);
      if (r.success)
        toast.success(
          next === 'realise' ? 'RDV réalisé' : 'RDV remis en prévu',
        );
      else toast.error(r.error ?? 'Erreur');
    });
  }

  async function handleDelete(id: string) {
    const r = await deleteRdvFormateur(id);
    if (r.success) {
      toast.success('RDV supprimé');
      setConfirmDelete(null);
    } else toast.error(r.error ?? 'Erreur');
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4" /> RDV formateurs
        </h3>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Ajouter un RDV
        </Button>
      </div>

      {rdvs.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun RDV</p>
      ) : (
        <div className="space-y-3">
          <TableSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un RDV..."
          />
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date prévue</TableHead>
                  <TableHead>Formateur</TableHead>
                  <TableHead>Objet</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground h-12 text-center text-sm"
                    >
                      Aucun résultat.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((rdv) => (
                  <TableRow key={rdv.id}>
                    <TableCell className="text-sm tabular-nums">
                      {formatDate(rdv.date_prevue)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {rdv.formateur
                        ? `${rdv.formateur.prenom} ${rdv.formateur.nom}`
                        : (rdv.formateur_nom ?? '-')}
                    </TableCell>
                    <TableCell className="text-sm">
                      {rdv.objet ?? '-'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={STATUT_RDV_LABELS[rdv.statut]}
                        color={STATUT_RDV_COLORS[rdv.statut]}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title={
                            rdv.statut === 'realise'
                              ? 'Remettre en prévu'
                              : 'Marquer réalisé'
                          }
                          disabled={pendingId === rdv.id}
                          onClick={() => handleToggleStatut(rdv.id, rdv.statut)}
                        >
                          {pendingId === rdv.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : rdv.statut === 'realise' ? (
                            <XCircle className="h-3.5 w-3.5" />
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive h-7 w-7 p-0"
                          title="Supprimer"
                          onClick={() => setConfirmDelete(rdv.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <AddRdvFormateurDialog
        projetId={projetId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Supprimer le RDV"
        description="Cette action est irréversible."
        confirmText="Supprimer"
        variant="destructive"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
      />
    </Card>
  );
}

function AddRdvFormateurDialog({
  projetId,
  open,
  onOpenChange,
}: {
  projetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [formateurNom, setFormateurNom] = useState('');
  const [datePrevue, setDatePrevue] = useState('');
  const [objet, setObjet] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!datePrevue) {
      toast.error('Date prévue requise');
      return;
    }
    startTransition(async () => {
      const r = await createRdvFormateur(projetId, {
        formateurNom,
        datePrevue,
        objet,
        notes,
      });
      if (r.success) {
        toast.success('RDV ajouté');
        setFormateurNom('');
        setDatePrevue('');
        setObjet('');
        setNotes('');
        onOpenChange(false);
      } else toast.error(r.error ?? 'Erreur');
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="text-primary h-4 w-4" />
            Nouveau RDV formateur
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rdv-date">Date prévue</Label>
            <Input
              id="rdv-date"
              type="date"
              value={datePrevue}
              onChange={(e) => setDatePrevue(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rdv-formateur">Formateur</Label>
            <Input
              id="rdv-formateur"
              value={formateurNom}
              onChange={(e) => setFormateurNom(e.target.value)}
              placeholder="Nom du formateur"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rdv-objet">Objet</Label>
            <Input
              id="rdv-objet"
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              placeholder="Ex: Suivi pédagogique..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rdv-notes">Notes</Label>
            <Textarea
              id="rdv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !datePrevue}>
            {isPending ? 'Ajout...' : 'Ajouter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

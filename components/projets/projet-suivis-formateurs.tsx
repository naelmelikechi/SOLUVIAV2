'use client';

import { useMemo, useState, useTransition } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import {
  CalendarClock,
  CheckCircle2,
  Plus,
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
import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { formatDate } from '@/lib/utils/formatters';
import {
  createRdvFormateur,
  updateRdvFormateurStatut,
  deleteRdvFormateur,
} from '@/lib/actions/rdv';
import { toast } from 'sonner';
import type { RdvFormateurWithRefs } from '@/lib/queries/rdv';

interface ProjetSuivisFormateursProps {
  projetId: string;
  rdvs: RdvFormateurWithRefs[];
}

type RdvEnRetard = RdvFormateurWithRefs & { joursRetard: number };

function formateurNom(rdv: RdvFormateurWithRefs): string {
  return rdv.formateur
    ? `${rdv.formateur.prenom} ${rdv.formateur.nom}`
    : (rdv.formateur_nom ?? '-');
}

/**
 * Synthese des RDV formateurs : deux chiffres (realises, en retard) puis un
 * tableau des seuls RDV en retard. Pas de tableau pour les realises, leur
 * compte suffit - c'est le principe "on montre ce sur quoi on peut agir, pas
 * tout ce qu'on sait".
 *
 * Ce qu'on n'affiche pas, volontairement : le nombre de suivis attendu par
 * formateur (rien en base ne permet de le calculer, les RDV sont crees un
 * par un a la main - le commanditaire creuse la regle metier avant qu'on
 * invente un objectif qui rendrait l'indicateur mensonger).
 */
export function ProjetSuivisFormateurs({
  projetId,
  rdvs,
}: ProjetSuivisFormateursProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const { nbRealises, enRetard } = useMemo(() => {
    const today = new Date();
    const realises = rdvs.filter((r) => r.statut === 'realise').length;
    const retard: RdvEnRetard[] = rdvs
      .filter((r) => r.statut === 'prevu' && r.date_prevue < todayIso(today))
      .map((r) => ({
        ...r,
        joursRetard: differenceInDays(today, parseISO(r.date_prevue)),
      }))
      .sort((a, b) => b.joursRetard - a.joursRetard);
    return { nbRealises: realises, enRetard: retard };
  }, [rdvs]);

  function handleToggleStatut(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const r = await updateRdvFormateurStatut(id, 'realise');
      setPendingId(null);
      if (r.success) toast.success('RDV réalisé');
      else toast.error(r.error ?? 'Erreur');
    });
  }

  function handleDelete(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const r = await deleteRdvFormateur(id);
      setPendingId(null);
      if (r.success) {
        toast.success('RDV supprimé');
        setConfirmDelete(null);
      } else toast.error(r.error ?? 'Erreur');
    });
  }

  const columns = useMemo<ColumnDef<RdvEnRetard>[]>(
    () => [
      {
        id: 'formateur',
        accessorFn: (r) => formateurNom(r),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Formateur" />
        ),
        cell: ({ getValue }) => (
          <span className="text-sm">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'date_prevue',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Date prévue" />
        ),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {formatDate(row.original.date_prevue)}
          </span>
        ),
      },
      {
        accessorKey: 'joursRetard',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Retard" />
        ),
        cell: ({ row }) => (
          <span className="text-sm font-medium text-[var(--destructive)] tabular-nums">
            {row.original.joursRetard} jour
            {row.original.joursRetard > 1 ? 's' : ''}
          </span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        size: 96,
        header: () => 'Actions',
        cell: ({ row }) => {
          const rdv = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="size-7 p-0"
                title="Marquer réalisé"
                aria-label="Marquer réalisé"
                disabled={pendingId === rdv.id}
                onClick={() => handleToggleStatut(rdv.id)}
              >
                {pendingId === rdv.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive size-7 p-0"
                title="Supprimer"
                aria-label="Supprimer"
                onClick={() => setConfirmDelete(rdv.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        },
      },
    ],
    [pendingId],
  );

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="size-4" /> Suivis formateurs
        </h3>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />
          Ajouter un RDV
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-6">
        <div>
          <p className="text-2xl font-bold tabular-nums">{nbRealises}</p>
          <p className="text-muted-foreground text-sm">RDV réalisés</p>
        </div>
        <div>
          <p
            className={
              enRetard.length > 0
                ? 'text-2xl font-bold text-[var(--destructive)] tabular-nums'
                : 'text-2xl font-bold tabular-nums'
            }
          >
            {enRetard.length}
          </p>
          <p className="text-muted-foreground text-sm">RDV en retard</p>
        </div>
      </div>

      {enRetard.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun RDV en retard</p>
      ) : (
        <DataTable
          columns={columns}
          data={enRetard}
          searchPlaceholder="Rechercher un RDV..."
          paginationMode="auto"
          emptyMessage="Aucun résultat."
          defaultSort={{ id: 'joursRetard', desc: true }}
        />
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
        isPending={pendingId === confirmDelete}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
      />
    </Card>
  );
}

function todayIso(d: Date): string {
  return d.toISOString().slice(0, 10);
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
  const [formateurNomInput, setFormateurNomInput] = useState('');
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
        formateurNom: formateurNomInput,
        datePrevue,
        objet,
        notes,
      });
      if (r.success) {
        toast.success('RDV ajouté');
        setFormateurNomInput('');
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
            <CalendarClock className="text-primary size-4" />
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
              value={formateurNomInput}
              onChange={(e) => setFormateurNomInput(e.target.value)}
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

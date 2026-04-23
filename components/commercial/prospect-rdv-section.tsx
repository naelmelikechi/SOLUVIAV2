'use client';

import { useState, useTransition } from 'react';
import {
  CalendarDays,
  Plus,
  CheckCircle,
  XCircle,
  Trash2,
  Loader2,
} from 'lucide-react';
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
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils/formatters';
import { STATUT_RDV_LABELS, STATUT_RDV_COLORS } from '@/lib/utils/constants';
import {
  createRdvCommercial,
  updateRdvCommercialStatut,
  deleteRdvCommercial,
} from '@/lib/actions/rdv';
import { toast } from 'sonner';
import type { RdvCommercialWithRefs } from '@/lib/queries/rdv';

interface ProspectRdvSectionProps {
  prospectId: string;
  rdvs: RdvCommercialWithRefs[];
}

export function ProspectRdvSection({
  prospectId,
  rdvs,
}: ProspectRdvSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleToggle(id: string, current: string) {
    setPendingId(id);
    startTransition(async () => {
      const next = current === 'realise' ? 'prevu' : 'realise';
      const r = await updateRdvCommercialStatut(id, next);
      setPendingId(null);
      if (!r.success) toast.error(r.error ?? 'Erreur');
    });
  }

  async function handleDelete(id: string) {
    const r = await deleteRdvCommercial(id);
    if (!r.success) toast.error(r.error ?? 'Erreur');
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
          <CalendarDays className="h-3 w-3" /> RDV
        </h4>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Nouveau
        </Button>
      </div>

      {rdvs.length === 0 ? (
        <p className="text-muted-foreground text-xs">Aucun RDV</p>
      ) : (
        <ul className="space-y-1.5">
          {rdvs.map((rdv) => (
            <li
              key={rdv.id}
              className="border-border/60 flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium tabular-nums">
                    {formatDate(rdv.date_prevue)}
                  </span>
                  <StatusBadge
                    label={STATUT_RDV_LABELS[rdv.statut]}
                    color={STATUT_RDV_COLORS[rdv.statut]}
                  />
                </div>
                {rdv.objet && (
                  <div className="text-muted-foreground truncate">
                    {rdv.objet}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={pendingId === rdv.id}
                onClick={() => handleToggle(rdv.id, rdv.statut)}
                title={
                  rdv.statut === 'realise'
                    ? 'Remettre en prévu'
                    : 'Marquer réalisé'
                }
              >
                {pendingId === rdv.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : rdv.statut === 'realise' ? (
                  <XCircle className="h-3 w-3" />
                ) : (
                  <CheckCircle className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-6 w-6 p-0"
                onClick={() => handleDelete(rdv.id)}
                title="Supprimer"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AddRdvCommercialDialog
        prospectId={prospectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </section>
  );
}

function AddRdvCommercialDialog({
  prospectId,
  open,
  onOpenChange,
}: {
  prospectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
      const r = await createRdvCommercial(prospectId, {
        datePrevue,
        objet,
        notes,
      });
      if (r.success) {
        toast.success('RDV ajouté');
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
            Nouveau RDV commercial
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rdvc-date">Date prévue</Label>
            <Input
              id="rdvc-date"
              type="date"
              value={datePrevue}
              onChange={(e) => setDatePrevue(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rdvc-objet">Objet</Label>
            <Input
              id="rdvc-objet"
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              placeholder="Ex: Présentation offre..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rdvc-notes">Notes</Label>
            <Textarea
              id="rdvc-notes"
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

'use client';

import { useCallback, useState, useTransition } from 'react';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  createAbsenceAction,
  updateAbsenceAction,
  deleteAbsenceAction,
} from '@/lib/actions/absences';
import {
  computeAbsenceTotalHours,
  type AbsencePeriod,
  type AbsenceType,
} from '@/lib/utils/absences';

interface AbsenceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si fourni, la dialog est en mode edition de cette absence */
  absence?: AbsencePeriod;
  /** Date initiale pour la creation (par defaut : today) */
  initialDate?: string;
}

export function AbsenceFormDialog({
  open,
  onOpenChange,
  absence,
  initialDate,
}: AbsenceFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <FormContent
          key={absence?.id ?? 'new'}
          absence={absence}
          initialDate={initialDate}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  );
}

function FormContent({
  absence,
  initialDate,
  onOpenChange,
}: {
  absence?: AbsencePeriod;
  initialDate?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!absence;
  const today = format(new Date(), 'yyyy-MM-dd');
  const [type, setType] = useState<AbsenceType>(absence?.type ?? 'conges');
  const [dateDebut, setDateDebut] = useState(
    absence?.date_debut ?? initialDate ?? today,
  );
  const [dateFin, setDateFin] = useState(
    absence?.date_fin ?? initialDate ?? today,
  );
  const [demiJourDebut, setDemiJourDebut] = useState(
    absence?.demi_jour_debut ?? false,
  );
  const [demiJourFin, setDemiJourFin] = useState(
    absence?.demi_jour_fin ?? false,
  );
  const [isPending, startTransition] = useTransition();

  const total = computeAbsenceTotalHours(
    dateDebut,
    dateFin,
    demiJourDebut,
    demiJourFin,
  );

  const sameDay = dateDebut === dateFin;

  const handleSubmit = useCallback(
    function handleSubmit() {
      if (sameDay && demiJourDebut && demiJourFin) {
        toast.error(
          'Un seul jour ne peut pas etre demi-journee aux deux bornes',
        );
        return;
      }
      startTransition(async () => {
        const data = {
          type,
          date_debut: dateDebut,
          date_fin: dateFin,
          demi_jour_debut: demiJourDebut,
          demi_jour_fin: demiJourFin,
        };
        const result = isEdit
          ? await updateAbsenceAction(absence!.id, data)
          : await createAbsenceAction(data);
        if (result.success) {
          toast.success(isEdit ? 'Absence mise a jour' : 'Absence enregistree');
          onOpenChange(false);
        } else {
          toast.error(result.error ?? 'Erreur lors de l enregistrement');
        }
      });
    },
    [
      sameDay,
      demiJourDebut,
      demiJourFin,
      type,
      dateDebut,
      dateFin,
      isEdit,
      absence,
      onOpenChange,
    ],
  );

  useCmdEnter(handleSubmit, !isPending);

  function handleDelete() {
    if (!absence) return;
    startTransition(async () => {
      const result = await deleteAbsenceAction(absence.id);
      if (result.success) {
        toast.success('Absence supprimee');
        onOpenChange(false);
      } else {
        toast.error(result.error ?? 'Erreur lors de la suppression');
      }
    });
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? 'Modifier l absence' : 'Nouvelle absence'}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === 'conges' ? 'default' : 'outline'}
              onClick={() => setType('conges')}
              className="flex-1"
            >
              Conges
            </Button>
            <Button
              type="button"
              variant={type === 'maladie' ? 'default' : 'outline'}
              onClick={() => setType('maladie')}
              className="flex-1"
            >
              Maladie
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="date_debut">Du</Label>
            <Input
              id="date_debut"
              type="date"
              value={dateDebut}
              onChange={(e) => {
                setDateDebut(e.target.value);
                if (e.target.value > dateFin) setDateFin(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_fin">Au</Label>
            <Input
              id="date_fin"
              type="date"
              value={dateFin}
              min={dateDebut}
              onChange={(e) => setDateFin(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="demi_debut"
              checked={demiJourDebut}
              onCheckedChange={(v) => setDemiJourDebut(v === true)}
            />
            <Label
              htmlFor="demi_debut"
              className="cursor-pointer text-sm font-normal"
            >
              Commence l apres-midi (3.5h le{' '}
              {format(new Date(dateDebut), 'dd/MM')})
            </Label>
          </div>
          {!sameDay && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="demi_fin"
                checked={demiJourFin}
                onCheckedChange={(v) => setDemiJourFin(v === true)}
              />
              <Label
                htmlFor="demi_fin"
                className="cursor-pointer text-sm font-normal"
              >
                Finit le matin (3.5h le {format(new Date(dateFin), 'dd/MM')})
              </Label>
            </div>
          )}
        </div>

        <div className="bg-muted/30 rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground">Total : </span>
          <span className="font-medium">
            {total.jours} jour{total.jours > 1 ? 's' : ''} ouvre
            {total.jours > 1 ? 's' : ''} / {total.heures}h
          </span>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        {isEdit && (
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            Supprimer
          </Button>
        )}
        <div className="flex flex-1 justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending
              ? isEdit
                ? 'Mise a jour...'
                : 'Enregistrement...'
              : isEdit
                ? 'Enregistrer'
                : 'Creer'}
            {!isPending && <span className="ml-2 text-xs opacity-50">⌘↵</span>}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

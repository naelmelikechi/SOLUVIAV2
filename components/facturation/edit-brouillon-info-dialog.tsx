'use client';

import { useCallback, useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import { updateBrouillonInfo } from '@/lib/actions/factures';

interface EditBrouillonInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factureId: string;
  initial: {
    date_emission: string | null;
    date_echeance: string | null;
    objet: string | null;
    conditions_reglement: string | null;
  };
  onSuccess?: () => void;
}

export function EditBrouillonInfoDialog(props: EditBrouillonInfoDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <Inner {...props} />}
    </Dialog>
  );
}

function Inner({
  factureId,
  initial,
  onOpenChange,
  onSuccess,
}: EditBrouillonInfoDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [dateEmission, setDateEmission] = useState(initial.date_emission ?? '');
  const [dateEcheance, setDateEcheance] = useState(initial.date_echeance ?? '');
  const [objet, setObjet] = useState(initial.objet ?? '');
  const [conditions, setConditions] = useState(
    initial.conditions_reglement ?? '',
  );

  const handleSubmit = useCallback(() => {
    if (dateEmission && dateEcheance && dateEcheance < dateEmission) {
      toast.error("L'échéance ne peut pas être antérieure à l'émission");
      return;
    }

    startTransition(async () => {
      const result = await updateBrouillonInfo({
        factureId,
        date_emission: dateEmission || undefined,
        date_echeance: dateEcheance || undefined,
        objet: objet.trim() === '' ? null : objet,
        conditions_reglement: conditions.trim() === '' ? null : conditions,
      });
      if (result.success) {
        toast.success('Informations mises à jour');
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast.error(result.error ?? 'Erreur lors de la mise à jour');
      }
    });
  }, [
    factureId,
    dateEmission,
    dateEcheance,
    objet,
    conditions,
    onOpenChange,
    onSuccess,
  ]);

  useCmdEnter(handleSubmit, !isPending);

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Modifier les informations</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="date_emission">Date d&apos;émission</Label>
            <Input
              id="date_emission"
              type="date"
              value={dateEmission}
              onChange={(e) => setDateEmission(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_echeance">Date d&apos;échéance</Label>
            <Input
              id="date_echeance"
              type="date"
              value={dateEcheance}
              onChange={(e) => setDateEcheance(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="objet">Objet</Label>
          <Input
            id="objet"
            placeholder="Ex: Mise en relation commerciale - Projet X - 2026-05"
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Laisser vide pour utiliser le libellé par défaut « Commission de
            gestion - Projet X - YYYY-MM ».
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="conditions">Conditions de règlement</Label>
          <Input
            id="conditions"
            placeholder="Ex: Paiement à réception"
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Affiché sous la date d&apos;échéance et dans le bloc Modalités de
            paiement. Vide = « 30 jours fin de mois » par défaut.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

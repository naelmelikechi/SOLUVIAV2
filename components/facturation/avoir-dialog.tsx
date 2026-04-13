'use client';

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { createAvoir } from '@/lib/actions/factures';

const MOTIFS_AVOIR = [
  'Rupture anticipée',
  'Erreur de facturation',
  'Remise commerciale',
  'Ajustement',
  'Compensation',
] as const;

interface AvoirDialogProps {
  factureRef: string;
  factureOrigineId: string;
  montantHtDefault: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AvoirDialog({
  factureRef,
  factureOrigineId,
  montantHtDefault,
  open,
  onOpenChange,
}: AvoirDialogProps) {
  const [motif, setMotif] = useState<string>('');
  const [montantHt, setMontantHt] = useState<string>(
    montantHtDefault.toString(),
  );
  const [note, setNote] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    if (!motif) {
      toast.error('Veuillez sélectionner un motif');
      return;
    }
    const montantValue = parseFloat(montantHt);
    if (isNaN(montantValue) || montantValue <= 0) {
      toast.error('Le montant doit être strictement positif');
      return;
    }
    // Check max 2 decimal places
    if (!/^\d+(\.\d{1,2})?$/.test(montantHt.trim())) {
      toast.error('Le montant ne peut avoir que 2 décimales maximum');
      return;
    }
    if (montantValue > montantHtDefault) {
      toast.error('Le montant ne peut pas dépasser le montant de la facture');
      return;
    }

    startTransition(async () => {
      const result = await createAvoir({
        factureOrigineId,
        motif: motif.trim(),
        montant: montantValue,
        note: note.trim() || undefined,
      });
      if (result.success) {
        toast.success(`Avoir ${result.ref} émis avec succès`);
        onOpenChange(false);
        setMotif('');
        setMontantHt(montantHtDefault.toString());
        setNote('');
      } else {
        toast.error(result.error ?? 'Erreur lors de la création');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Émettre un avoir sur {factureRef}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Motif */}
          <div className="space-y-2">
            <Label htmlFor="motif">Motif</Label>
            <Select value={motif} onValueChange={(v) => setMotif(v ?? '')}>
              <SelectTrigger className="w-full" id="motif">
                <SelectValue placeholder="Sélectionner un motif" />
              </SelectTrigger>
              <SelectContent>
                {MOTIFS_AVOIR.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Montant HT */}
          <div className="space-y-2">
            <Label htmlFor="montant_ht">Montant HT</Label>
            <Input
              id="montant_ht"
              type="number"
              min="0"
              step="0.01"
              value={montantHt}
              onChange={(e) => setMontantHt(e.target.value)}
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note (optionnel)</Label>
            <Textarea
              id="note"
              placeholder="Ajouter une note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? 'Création...' : "Confirmer l'avoir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

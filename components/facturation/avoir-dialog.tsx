'use client';

import { useState } from 'react';
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

const MOTIFS_AVOIR = [
  'Rupture anticipee',
  'Erreur de facturation',
  'Remise commerciale',
  'Ajustement',
  'Compensation',
] as const;

interface AvoirDialogProps {
  factureRef: string;
  montantHtDefault: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AvoirDialog({
  factureRef,
  montantHtDefault,
  open,
  onOpenChange,
}: AvoirDialogProps) {
  const [motif, setMotif] = useState<string>('');
  const [montantHt, setMontantHt] = useState<string>(
    montantHtDefault.toString(),
  );
  const [note, setNote] = useState<string>('');

  function handleConfirm() {
    if (!motif) {
      toast.error('Veuillez selectionner un motif');
      return;
    }

    const montant = parseFloat(montantHt);
    if (isNaN(montant) || montant <= 0) {
      toast.error('Le montant doit etre superieur a zero');
      return;
    }

    // TODO: call server action to create avoir
    toast.success('Avoir emis avec succes');
    onOpenChange(false);

    // Reset form
    setMotif('');
    setMontantHt(montantHtDefault.toString());
    setNote('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Emettre un avoir sur {factureRef}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Motif */}
          <div className="space-y-2">
            <Label htmlFor="motif">Motif</Label>
            <Select value={motif} onValueChange={(v) => setMotif(v ?? '')}>
              <SelectTrigger className="w-full" id="motif">
                <SelectValue placeholder="Selectionner un motif" />
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
          <Button variant="destructive" onClick={handleConfirm}>
            Confirmer l&apos;avoir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

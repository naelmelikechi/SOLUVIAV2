'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { createFactureFromDevis } from '@/lib/actions/devis-to-facture';

type Mode = 'acompte' | 'solde' | 'personnalisee';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devisId: string;
  devisRef: string | null;
  totalHt: number;
  totalDejaFactureHt: number;
}

export function CreateFactureFromDevisDialog({
  open,
  onOpenChange,
  devisId,
  devisRef,
  totalHt,
  totalDejaFactureHt,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('acompte');
  const [pourcentage, setPourcentage] = useState(50);
  const [pending, startTransition] = useTransition();

  const resteHt = Math.max(0, totalHt - totalDejaFactureHt);
  const depassement = totalDejaFactureHt >= totalHt && totalHt > 0;

  const montantPreviewHt =
    mode === 'acompte'
      ? Math.round(totalHt * pourcentage) / 100
      : mode === 'solde'
        ? resteHt
        : totalHt;

  function handleSubmit() {
    startTransition(async () => {
      const res = await createFactureFromDevis({
        devisId,
        mode,
        pourcentage: mode === 'acompte' ? pourcentage : undefined,
      });
      if (res.success) {
        toast.success('Facture brouillon creee avec succes.');
        onOpenChange(false);
        router.push('/facturation');
      } else {
        toast.error(res.error);
      }
    });
  }

  const pct = totalHt > 0 ? (totalDejaFactureHt / totalHt) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Creer une facture depuis {devisRef ?? 'ce devis'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Encart deja facture */}
          {totalDejaFactureHt > 0 && (
            <div
              className={`rounded-md border p-3 text-sm ${depassement ? 'border-red-300 bg-red-50' : 'border-muted bg-muted/30'}`}
            >
              <p className="font-medium">
                Deja facture : {totalDejaFactureHt.toFixed(2).replace('.', ',')}{' '}
                EUR HT / {totalHt.toFixed(2).replace('.', ',')} EUR HT (
                {pct.toFixed(0)}%)
              </p>
              {depassement && (
                <p className="mt-1 text-red-600">
                  Ce devis est deja entierement facture.
                </p>
              )}
            </div>
          )}

          {/* Choix du mode */}
          <div className="space-y-3">
            <Label>Mode de facturation</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              className="space-y-2"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="acompte" id="mode-acompte" />
                <Label
                  htmlFor="mode-acompte"
                  className="cursor-pointer font-normal"
                >
                  Acompte (pourcentage du total)
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="solde" id="mode-solde" />
                <Label
                  htmlFor="mode-solde"
                  className="cursor-pointer font-normal"
                >
                  Solde (reste a facturer)
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="personnalisee" id="mode-personnalisee" />
                <Label
                  htmlFor="mode-personnalisee"
                  className="cursor-pointer font-normal"
                >
                  Personnalisee (copie toutes les lignes)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Pourcentage si acompte */}
          {mode === 'acompte' && (
            <div className="space-y-1">
              <Label htmlFor="pourcentage">Pourcentage (%)</Label>
              <Input
                id="pourcentage"
                type="number"
                min={1}
                max={100}
                step={1}
                value={pourcentage}
                onChange={(e) => setPourcentage(Number(e.target.value))}
                className="w-32"
              />
            </div>
          )}

          {/* Preview montant */}
          <div className="rounded-md border p-3 text-sm">
            <p>
              Montant HT estime :{' '}
              <span className="font-mono font-semibold tabular-nums">
                {montantPreviewHt.toFixed(2).replace('.', ',')} EUR HT
              </span>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || (mode === 'solde' && depassement)}
          >
            {pending ? 'Creation...' : 'Creer la facture'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

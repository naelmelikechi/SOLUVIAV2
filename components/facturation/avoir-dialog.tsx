'use client';

import { useEffect, useState, useTransition } from 'react';
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
import {
  computeProrataAvoir,
  createAvoir,
  type ProrataBreakdownItem,
} from '@/lib/actions/factures';
import { formatCurrency } from '@/lib/utils/formatters';

const MOTIF_RUPTURE = 'Rupture anticipée';

const MOTIFS_AVOIR = [
  MOTIF_RUPTURE,
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
  const [dateRupture, setDateRupture] = useState<string>('');
  const [breakdown, setBreakdown] = useState<ProrataBreakdownItem[] | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const [isComputing, startComputing] = useTransition();

  function handleMotifChange(next: string) {
    setMotif(next);
    if (next !== MOTIF_RUPTURE) {
      setDateRupture('');
      setBreakdown(null);
      setMontantHt(montantHtDefault.toString());
    }
  }

  // When dateRupture changes (and motif is rupture), compute pro-rata
  useEffect(() => {
    if (motif !== MOTIF_RUPTURE || !dateRupture) return;
    startComputing(async () => {
      const result = await computeProrataAvoir({
        factureOrigineId,
        dateRupture,
      });
      if (!result.success) {
        toast.error(result.error ?? 'Erreur de calcul pro-rata');
        setBreakdown(null);
        return;
      }
      const suggested = Math.min(result.suggestedAmount ?? 0, montantHtDefault);
      setBreakdown(result.breakdown ?? null);
      setMontantHt(suggested.toFixed(2));
    });
  }, [motif, dateRupture, factureOrigineId, montantHtDefault]);

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
    if (!/^\d+(\.\d{1,2})?$/.test(montantHt.trim())) {
      toast.error('Le montant ne peut avoir que 2 décimales maximum');
      return;
    }
    if (montantValue > montantHtDefault) {
      toast.error('Le montant ne peut pas dépasser le montant de la facture');
      return;
    }
    if (motif === MOTIF_RUPTURE && !dateRupture) {
      toast.error('Date de rupture requise');
      return;
    }

    const finalNote =
      motif === MOTIF_RUPTURE
        ? [`Date de rupture : ${dateRupture}`, note.trim()]
            .filter(Boolean)
            .join(' · ')
        : note.trim() || undefined;

    startTransition(async () => {
      const result = await createAvoir({
        factureOrigineId,
        motif: motif.trim(),
        montant: montantValue,
        note: finalNote || undefined,
      });
      if (result.success) {
        toast.success(`Avoir ${result.ref} émis avec succès`);
        onOpenChange(false);
        setMotif('');
        setMontantHt(montantHtDefault.toString());
        setNote('');
        setDateRupture('');
        setBreakdown(null);
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
            <Select
              value={motif}
              onValueChange={(v) => handleMotifChange(v ?? '')}
            >
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

          {/* Date de rupture (rupture uniquement) */}
          {motif === MOTIF_RUPTURE && (
            <div className="space-y-2">
              <Label htmlFor="date_rupture">Date de rupture</Label>
              <Input
                id="date_rupture"
                type="date"
                value={dateRupture}
                onChange={(e) => setDateRupture(e.target.value)}
              />
              {isComputing && (
                <p className="text-muted-foreground text-xs">
                  Calcul du pro-rata…
                </p>
              )}
              {breakdown && breakdown.length > 0 && !isComputing && (
                <div className="bg-muted/30 rounded-md border p-2 text-xs">
                  <p className="text-muted-foreground mb-1">
                    Détail du pro-rata par contrat (durée réalisée / totale) :
                  </p>
                  <ul className="space-y-1">
                    {breakdown.map((b, i) => (
                      <li
                        key={i}
                        className="flex justify-between gap-2 text-[11px]"
                      >
                        <span className="truncate">
                          {b.apprenant}
                          {b.contratRef ? ` (${b.contratRef})` : ''} ·{' '}
                          {b.dureeRealiseeMois}/{b.dureeTotaleMois} mois
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatCurrency(b.avoirLigneHt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

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
            {motif === MOTIF_RUPTURE && breakdown && (
              <p className="text-muted-foreground text-xs">
                Pro-rata temporis calculé automatiquement. Tu peux ajuster le
                montant si besoin.
              </p>
            )}
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
            disabled={isPending || isComputing}
          >
            {isPending ? 'Création...' : "Confirmer l'avoir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

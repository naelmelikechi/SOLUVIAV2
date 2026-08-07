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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { upsertRegleArchivage } from '@/lib/actions/contrats-regles';
import { CONTRACT_STATE_LABELS } from '@/lib/utils/contrat-states';
import type { RegleArchivageRow } from '@/lib/queries/contrats-regles';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regle: RegleArchivageRow | null;
}

const ETATS = Object.entries(CONTRACT_STATE_LABELS);

function RegleFormBody({
  regle,
  onClose,
}: {
  regle: RegleArchivageRow | null;
  onClose: () => void;
}) {
  const [nom, setNom] = useState(regle?.nom ?? '');
  const [etatSource, setEtatSource] = useState(regle?.etat_source ?? '');
  const [delaiJours, setDelaiJours] = useState(
    regle ? String(regle.delai_jours) : '30',
  );
  const [actif, setActif] = useState(regle?.actif ?? true);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const delai = Number.parseInt(delaiJours, 10);
    if (!etatSource) {
      toast.error('Choisissez un etat source');
      return;
    }
    if (!Number.isFinite(delai) || delai <= 0) {
      toast.error('Le delai doit etre un entier positif');
      return;
    }
    startTransition(async () => {
      const res = await upsertRegleArchivage({
        id: regle?.id,
        nom,
        etat_source: etatSource,
        delai_jours: delai,
        actif,
      });
      if (res.success) {
        toast.success(regle ? 'Regle mise a jour' : 'Regle creee');
        onClose();
      } else {
        toast.error(res.error ?? 'Erreur');
      }
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="regle-nom">Nom</Label>
          <Input
            id="regle-nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Brouillon jamais transmis"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="regle-etat">Etat source</Label>
          <Select
            value={etatSource || undefined}
            onValueChange={(v) => setEtatSource(v ?? '')}
          >
            <SelectTrigger className="w-full" id="regle-etat">
              <SelectValue placeholder="Choisir un etat">
                {(v) =>
                  v ? (CONTRACT_STATE_LABELS[v] ?? v) : 'Choisir un etat'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ETATS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Choisi dans la liste des etats connus - une saisie libre pourrait
            creer une regle inerte que personne ne verrait.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="regle-delai">Delai (jours)</Label>
          <Input
            id="regle-delai"
            type="number"
            min={1}
            value={delaiJours}
            onChange={(e) => setDelaiJours(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={actif}
            onCheckedChange={(v) => setActif(v === true)}
          />
          <span className="text-sm">Regle active</span>
        </label>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function RegleArchivageFormDialog({ open, onOpenChange, regle }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {regle ? 'Modifier la regle' : 'Nouvelle regle'}
          </DialogTitle>
        </DialogHeader>
        <RegleFormBody
          key={`${regle?.id ?? 'new'}-${String(open)}`}
          regle={regle}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

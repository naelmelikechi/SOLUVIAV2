'use client';
import * as React from 'react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { updateRelanceFields } from '@/lib/crm/actions/relances';
import type { Priorite } from '@/lib/crm/domain/enums';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { prioriteItems } from '@/lib/crm/labels';

type Rel = {
  id: string;
  titre: string;
  date_echeance: string;
  priorite: string;
};

/** Édition rapide d'une relance (titre / échéance / priorité) - update partiel. */
export function RelanceQuickEdit({
  relance,
  trigger,
}: {
  relance: Rel;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [titre, setTitre] = useState(relance.titre);
  const [echeance, setEcheance] = useState(relance.date_echeance);
  const [priorite, setPriorite] = useState(relance.priorite);

  const save = () =>
    start(async () => {
      if (!titre.trim()) {
        toast.error('Titre requis');
        return;
      }
      if (!echeance) {
        toast.error('Échéance requise');
        return;
      }
      // updateRelanceFields revalide /relances (route courante) : refresh redondant.
      await runWithToast(
        () =>
          updateRelanceFields(relance.id, {
            titre,
            date_echeance: echeance,
            priorite: priorite as Priorite,
          }),
        {
          success: 'Relance mise à jour',
          error: 'Mise à jour impossible',
          onSuccess: () => setOpen(false),
        },
      );
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier la relance</DialogTitle>
          <DialogDescription className="sr-only">
            Modifier le titre, l&apos;échéance et la priorité.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rqe-titre">Titre *</Label>
            <Input
              id="rqe-titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rqe-echeance">Échéance *</Label>
              <Input
                id="rqe-echeance"
                type="date"
                value={echeance}
                onChange={(e) => setEcheance(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Priorité</Label>
              <Select
                items={prioriteItems}
                value={priorite}
                onValueChange={(v) => {
                  if (typeof v === 'string') setPriorite(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {prioriteItems.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? '…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

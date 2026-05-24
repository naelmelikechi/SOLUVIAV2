'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { refuseDevisPublicAction } from './actions';

export function RefuseForm({
  token,
  onDone,
  onCancel,
}: {
  token: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [motif, setMotif] = useState('');
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await refuseDevisPublicAction(token, motif);
      if (res.success) {
        toast.success('Devis refusé. Réponse enregistrée.');
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border bg-white p-6">
      <h1 className="text-xl font-semibold">Refuser le devis</h1>
      <div className="space-y-2">
        <Label htmlFor="motif">Motif (optionnel)</Label>
        <Textarea
          id="motif"
          rows={4}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Pourquoi refusez-vous ce devis ?"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Annuler
        </Button>
        <Button onClick={submit} disabled={pending}>
          Confirmer le refus
        </Button>
      </div>
    </div>
  );
}

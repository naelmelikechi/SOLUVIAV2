'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { acceptDevisPublicAction } from './actions';

export function AcceptForm({
  token,
  devisRef,
  onDone,
  onCancel,
}: {
  token: string;
  devisRef: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [engage, setEngage] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    if (!nom || !email || !engage) return;
    start(async () => {
      const res = await acceptDevisPublicAction(token, nom, email);
      if (res.success) {
        toast.success(`Devis ${devisRef} accepté. Merci !`);
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border bg-white p-6">
      <h1 className="text-xl font-semibold">Accepter le devis {devisRef}</h1>
      <div className="space-y-2">
        <Label htmlFor="nom">Nom du signataire</Label>
        <Input
          id="nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Prenom Nom"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@entreprise.fr"
        />
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="engage"
          checked={engage}
          onCheckedChange={(c) => setEngage(c === true)}
        />
        <Label htmlFor="engage" className="text-xs font-normal">
          Je certifie avoir le pouvoir d&apos;engager la société et accepte le
          devis dans son intégralité.
        </Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Annuler
        </Button>
        <Button
          onClick={submit}
          disabled={!nom || !email || !engage || pending}
        >
          {pending ? 'Envoi...' : "Confirmer l'acceptation"}
        </Button>
      </div>
    </div>
  );
}

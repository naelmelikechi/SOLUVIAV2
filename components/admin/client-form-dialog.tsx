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
import { toast } from 'sonner';
import { createClientAction, updateClientAction } from '@/lib/actions/clients';
import type { ClientDetail } from '@/lib/queries/clients';

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: ClientDetail;
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: ClientFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* key forces remount on open/close so form state resets */}
      {open && (
        <ClientFormContent client={client} onOpenChange={onOpenChange} />
      )}
    </Dialog>
  );
}

function ClientFormContent({
  client,
  onOpenChange,
}: {
  client?: ClientDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!client;
  const [isPending, startTransition] = useTransition();

  const [raisonSociale, setRaisonSociale] = useState(
    client?.raison_sociale ?? '',
  );
  const [siret, setSiret] = useState(client?.siret ?? '');
  const [adresse, setAdresse] = useState(client?.adresse ?? '');
  const [localisation, setLocalisation] = useState(client?.localisation ?? '');
  const [tvaIntra, setTvaIntra] = useState(
    client?.tva_intracommunautaire ?? '',
  );
  const [numeroQualiopi, setNumeroQualiopi] = useState(
    client?.numero_qualiopi ?? '',
  );
  const [numeroNda, setNumeroNda] = useState(client?.numero_nda ?? '');
  const [numeroUai, setNumeroUai] = useState(client?.numero_uai ?? '');

  function handleSubmit() {
    if (!raisonSociale.trim()) {
      toast.error('La raison sociale est requise');
      return;
    }

    const data = {
      raison_sociale: raisonSociale,
      siret: siret || null,
      adresse: adresse || null,
      localisation: localisation || null,
      tva_intracommunautaire: tvaIntra || null,
      numero_qualiopi: numeroQualiopi || null,
      numero_nda: numeroNda || null,
      numero_uai: numeroUai || null,
    };

    startTransition(async () => {
      if (isEdit) {
        const result = await updateClientAction(client.id, data);
        if (result.success) {
          toast.success('Client mis a jour');
          onOpenChange(false);
        } else {
          toast.error(result.error ?? 'Erreur lors de la mise a jour');
        }
      } else {
        const result = await createClientAction(data);
        if (result.success) {
          toast.success('Client cree avec succes');
          onOpenChange(false);
        } else {
          toast.error(result.error ?? 'Erreur lors de la creation');
        }
      }
    });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? 'Modifier le client' : 'Nouveau client'}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="raison_sociale">
            Raison sociale <span className="text-destructive">*</span>
          </Label>
          <Input
            id="raison_sociale"
            placeholder="Nom de l'organisme"
            required
            value={raisonSociale}
            onChange={(e) => setRaisonSociale(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="siret">SIRET</Label>
            <Input
              id="siret"
              placeholder="123 456 789 00012"
              value={siret}
              onChange={(e) => setSiret(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tva_intra">TVA intracommunautaire</Label>
            <Input
              id="tva_intra"
              placeholder="FR12345678901"
              value={tvaIntra}
              onChange={(e) => setTvaIntra(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="adresse">Adresse</Label>
          <Input
            id="adresse"
            placeholder="Adresse postale"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="localisation">Localisation</Label>
          <Input
            id="localisation"
            placeholder="Ville, region..."
            value={localisation}
            onChange={(e) => setLocalisation(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="numero_qualiopi">N° Qualiopi</Label>
            <Input
              id="numero_qualiopi"
              value={numeroQualiopi}
              onChange={(e) => setNumeroQualiopi(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="numero_nda">N° NDA</Label>
            <Input
              id="numero_nda"
              value={numeroNda}
              onChange={(e) => setNumeroNda(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="numero_uai">N° UAI</Label>
            <Input
              id="numero_uai"
              value={numeroUai}
              onChange={(e) => setNumeroUai(e.target.value)}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending
            ? isEdit
              ? 'Mise a jour...'
              : 'Creation...'
            : isEdit
              ? 'Enregistrer'
              : 'Creer le client'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

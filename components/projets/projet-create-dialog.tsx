'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { toast } from 'sonner';
import { createProjet } from '@/lib/actions/projets';

interface ProjetCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: { id: string; raison_sociale: string }[];
  typologies: { id: string; code: string; libelle: string }[];
  users: { id: string; nom: string; prenom: string }[];
}

export function ProjetCreateDialog({
  open,
  onOpenChange,
  clients,
  typologies,
  users,
}: ProjetCreateDialogProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [typologieId, setTypologieId] = useState('');
  const [cdpId, setCdpId] = useState('');
  const [backupCdpId, setBackupCdpId] = useState('');
  const [tauxCommission, setTauxCommission] = useState('10');
  const [dateDebut, setDateDebut] = useState('');
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setClientId('');
    setTypologieId('');
    setCdpId('');
    setBackupCdpId('');
    setTauxCommission('10');
    setDateDebut('');
  }

  function handleSubmit() {
    if (!clientId) {
      toast.error('Veuillez selectionner un client');
      return;
    }
    if (!typologieId) {
      toast.error('Veuillez selectionner une typologie');
      return;
    }
    if (!cdpId) {
      toast.error('Veuillez selectionner un chef de projet');
      return;
    }

    const taux = parseFloat(tauxCommission);
    if (isNaN(taux) || taux < 0 || taux > 100) {
      toast.error('Le taux de commission doit etre entre 0 et 100');
      return;
    }

    startTransition(async () => {
      const result = await createProjet({
        clientId,
        typologieId,
        cdpId,
        backupCdpId: backupCdpId || undefined,
        tauxCommission: taux,
        dateDebut: dateDebut || undefined,
      });

      if (result.success) {
        toast.success(`Projet ${result.ref} cree avec succes`);
        onOpenChange(false);
        resetForm();
        if (result.ref) {
          router.push(`/projets/${result.ref}`);
        }
      } else {
        toast.error(result.error ?? 'Erreur lors de la creation');
      }
    });
  }

  // Filter active typologies (exclude ABS)
  const activeTypologies = typologies.filter((t) => t.code !== 'ABS');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client */}
          <div className="space-y-2">
            <Label htmlFor="client">Client</Label>
            <Select
              value={clientId}
              onValueChange={(v) => setClientId(v ?? '')}
            >
              <SelectTrigger className="w-full" id="client">
                <SelectValue placeholder="Selectionner un client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.raison_sociale}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Typologie */}
          <div className="space-y-2">
            <Label htmlFor="typologie">Typologie</Label>
            <Select
              value={typologieId}
              onValueChange={(v) => setTypologieId(v ?? '')}
            >
              <SelectTrigger className="w-full" id="typologie">
                <SelectValue placeholder="Selectionner une typologie" />
              </SelectTrigger>
              <SelectContent>
                {activeTypologies.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.libelle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CDP */}
          <div className="space-y-2">
            <Label htmlFor="cdp">Chef de projet</Label>
            <Select value={cdpId} onValueChange={(v) => setCdpId(v ?? '')}>
              <SelectTrigger className="w-full" id="cdp">
                <SelectValue placeholder="Selectionner un CDP" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.prenom} {u.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Backup CDP */}
          <div className="space-y-2">
            <Label htmlFor="backup_cdp">CDP backup (optionnel)</Label>
            <Select
              value={backupCdpId}
              onValueChange={(v) => setBackupCdpId(v ?? '')}
            >
              <SelectTrigger className="w-full" id="backup_cdp">
                <SelectValue placeholder="Aucun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Aucun</SelectItem>
                {users
                  .filter((u) => u.id !== cdpId)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.prenom} {u.nom}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Taux commission */}
          <div className="space-y-2">
            <Label htmlFor="taux_commission">Taux de commission (%)</Label>
            <Input
              id="taux_commission"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={tauxCommission}
              onChange={(e) => setTauxCommission(e.target.value)}
            />
          </div>

          {/* Date debut */}
          <div className="space-y-2">
            <Label htmlFor="date_debut">Date de debut (optionnel)</Label>
            <Input
              id="date_debut"
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Creation...' : 'Creer le projet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

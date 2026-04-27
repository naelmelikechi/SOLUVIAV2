'use client';

import { useCallback, useState, useTransition } from 'react';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
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
import { inviteUser } from '@/lib/actions/users';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteUserDialog({
  open,
  onOpenChange,
}: InviteUserDialogProps) {
  const [email, setEmail] = useState('');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [role, setRole] = useState<string>('cdp');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = useCallback(
    function handleSubmit() {
      if (!email || !prenom.trim() || !nom.trim()) {
        toast.error('Veuillez remplir tous les champs');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        toast.error('Adresse email invalide');
        return;
      }

      startTransition(async () => {
        const result = await inviteUser(
          email,
          role as 'admin' | 'cdp',
          prenom.trim(),
          nom.trim(),
        );
        if (result.success) {
          toast.success(`Invitation envoyée à ${prenom} ${nom}`);
          onOpenChange(false);
          setEmail('');
          setPrenom('');
          setNom('');
          setRole('cdp');
        } else {
          toast.error(result.error ?? "Erreur lors de l'invitation");
        }
      });
    },
    [email, prenom, nom, role, onOpenChange],
  );

  useCmdEnter(handleSubmit, open && !isPending);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inviter un utilisateur</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="invite-prenom">Prénom</Label>
              <Input
                id="invite-prenom"
                placeholder="Prénom"
                required
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-nom">Nom</Label>
              <Input
                id="invite-nom"
                placeholder="Nom"
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="prenom@mysoluvia.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v ?? 'cdp')}>
              <SelectTrigger className="w-full" id="invite-role">
                <SelectValue placeholder="Sélectionner un rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cdp">CDP</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Envoi...' : 'Inviter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

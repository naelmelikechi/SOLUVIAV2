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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  updateUserRole,
  toggleUserActive,
  deleteUser,
} from '@/lib/actions/users';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { UserListItem } from '@/lib/queries/users';

interface UserEditDialogProps {
  user: UserListItem | null;
  callerRole?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserEditDialog({
  user,
  callerRole,
  open,
  onOpenChange,
}: UserEditDialogProps) {
  const [role, setRole] = useState<string>(user?.role ?? 'cdp');
  const [actif, setActif] = useState<string>(user?.actif ? 'true' : 'false');
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  // Sync local state when a different user is opened
  const [prevUserId, setPrevUserId] = useState<string | null>(null);
  if (user && user.id !== prevUserId) {
    setPrevUserId(user.id);
    setRole(user.role);
    setActif(user.actif ? 'true' : 'false');
  }

  if (!user) return null;

  function handleSave() {
    if (!user) return;
    startTransition(async () => {
      const newRole = role as 'admin' | 'cdp';
      const newActif = actif === 'true';

      const roleChanged = newRole !== user.role;
      const actifChanged = newActif !== user.actif;

      if (!roleChanged && !actifChanged) {
        onOpenChange(false);
        return;
      }

      if (roleChanged) {
        const result = await updateUserRole(user.id, newRole);
        if (!result.success) {
          toast.error(result.error ?? 'Erreur lors de la mise à jour du rôle');
          return;
        }
      }

      if (actifChanged) {
        const result = await toggleUserActive(user.id, newActif);
        if (!result.success) {
          toast.error(
            result.error ?? 'Erreur lors de la mise à jour du statut',
          );
          return;
        }
      }

      toast.success('Utilisateur mis à jour');
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Modifier {user.prenom} {user.nom}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-role">Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v ?? 'cdp')}>
              <SelectTrigger className="w-full" id="edit-role">
                <SelectValue placeholder="Sélectionner un rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cdp">CDP</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-actif">Statut</Label>
            <Select value={actif} onValueChange={(v) => setActif(v ?? 'true')}>
              <SelectTrigger className="w-full" id="edit-actif">
                <SelectValue placeholder="Sélectionner un statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Actif</SelectItem>
                <SelectItem value="false">Inactif</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {callerRole === 'superadmin' && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400"
              onClick={() => setDeleteOpen(true)}
              disabled={isPending || deletePending}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Supprimer
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer l'utilisateur"
        description={`Êtes-vous sûr de vouloir supprimer ${user.prenom} ${user.nom} ? Cette action est irréversible. Ses saisies de temps, notes et notifications seront supprimées.`}
        confirmText="Supprimer définitivement"
        variant="destructive"
        isPending={deletePending}
        onConfirm={async () => {
          setDeletePending(true);
          const result = await deleteUser(user.id);
          setDeletePending(false);
          if (result.success) {
            toast.success('Utilisateur supprimé');
            setDeleteOpen(false);
            onOpenChange(false);
          } else {
            toast.error(result.error ?? 'Erreur lors de la suppression');
          }
        }}
      />
    </Dialog>
  );
}

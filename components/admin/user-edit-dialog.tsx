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
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  updateUserRole,
  toggleUserActive,
  deleteUser,
  updateUserProfile,
  updateUserPipelineAccess,
  updateUserIdeasPermissions,
} from '@/lib/actions/users';
import { Checkbox } from '@/components/ui/checkbox';
import { isAdmin } from '@/lib/utils/roles';
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
  const [prenom, setPrenom] = useState(user?.prenom ?? '');
  const [nom, setNom] = useState(user?.nom ?? '');
  const [role, setRole] = useState<string>(user?.role ?? 'cdp');
  const [actif, setActif] = useState<string>(user?.actif ? 'true' : 'false');
  const [pipelineAccess, setPipelineAccess] = useState<boolean>(
    user?.pipeline_access ?? false,
  );
  const [canShipIdeasFlag, setCanShipIdeasFlag] = useState<boolean>(
    user?.can_ship_ideas ?? false,
  );
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const [prevUserId, setPrevUserId] = useState<string | null>(null);
  if (user && user.id !== prevUserId) {
    setPrevUserId(user.id);
    setPrenom(user.prenom);
    setNom(user.nom);
    setRole(user.role);
    setActif(user.actif ? 'true' : 'false');
    setPipelineAccess(user.pipeline_access ?? false);
    setCanShipIdeasFlag(user.can_ship_ideas ?? false);
  }

  const handleSave = useCallback(
    function handleSave() {
      if (!user) return;
      startTransition(async () => {
        const newRole = role as 'admin' | 'cdp';
        const newActif = actif === 'true';

        const nameChanged =
          prenom.trim() !== user.prenom || nom.trim() !== user.nom;
        const roleChanged = newRole !== user.role;
        const actifChanged = newActif !== user.actif;
        const pipelineChanged =
          pipelineAccess !== (user.pipeline_access ?? false);
        const ideasChanged =
          canShipIdeasFlag !== (user.can_ship_ideas ?? false);

        if (
          !nameChanged &&
          !roleChanged &&
          !actifChanged &&
          !pipelineChanged &&
          !ideasChanged
        ) {
          onOpenChange(false);
          return;
        }

        if (nameChanged) {
          const result = await updateUserProfile(
            user.id,
            prenom.trim(),
            nom.trim(),
          );
          if (!result.success) {
            toast.error(result.error ?? 'Erreur lors de la mise à jour du nom');
            return;
          }
        }

        if (roleChanged) {
          const result = await updateUserRole(user.id, newRole);
          if (!result.success) {
            toast.error(
              result.error ?? 'Erreur lors de la mise à jour du rôle',
            );
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

        if (pipelineChanged) {
          const result = await updateUserPipelineAccess(
            user.id,
            pipelineAccess,
          );
          if (!result.success) {
            toast.error(
              result.error ??
                "Erreur lors de la mise à jour de l'accès pipeline",
            );
            return;
          }
        }

        if (ideasChanged) {
          const result = await updateUserIdeasPermissions(user.id, {
            canValidateIdeas: user.can_validate_ideas ?? false,
            canShipIdeas: canShipIdeasFlag,
          });
          if (!result.success) {
            toast.error(
              result.error ??
                'Erreur lors de la mise à jour des permissions idées',
            );
            return;
          }
        }

        toast.success('Utilisateur mis à jour');
        onOpenChange(false);
      });
    },
    [
      user,
      role,
      actif,
      prenom,
      nom,
      pipelineAccess,
      canShipIdeasFlag,
      onOpenChange,
    ],
  );

  useCmdEnter(handleSave, open && !isPending);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Modifier {user.prenom} {user.nom}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-prenom">Prénom</Label>
              <Input
                id="edit-prenom"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-nom">Nom</Label>
              <Input
                id="edit-nom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </div>
          </div>

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

          <div className="space-y-2">
            <Label>Permissions</Label>
            <div className="space-y-2">
              <PermissionRow
                id="edit-pipeline-access"
                title="Accès au pipeline commercial"
                description={
                  isAdmin(role)
                    ? 'Accès implicite pour les administrateurs.'
                    : 'Autorise cet utilisateur à voir et gérer le pipeline commercial.'
                }
                checked={isAdmin(role) ? true : pipelineAccess}
                disabled={isAdmin(role)}
                onChange={setPipelineAccess}
              />
              <PermissionRow
                id="edit-ship-ideas"
                title="Marquer les idées implémentées"
                description={
                  isAdmin(role)
                    ? 'Accès implicite pour les administrateurs.'
                    : 'Peut marquer une idée validée comme livrée / implémentée.'
                }
                checked={isAdmin(role) ? true : canShipIdeasFlag}
                disabled={isAdmin(role)}
                onChange={setCanShipIdeasFlag}
              />
            </div>
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

function PermissionRow({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="border-border hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-muted-foreground mt-0.5 text-xs">
          {description}
        </div>
      </div>
    </label>
  );
}

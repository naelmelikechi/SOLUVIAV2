'use client';

import { useMemo, useState, useTransition } from 'react';
import { Users, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { toast } from 'sonner';
import {
  addClientContact,
  deleteClientContact,
  updateClientContact,
} from '@/lib/actions/clients';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { ClientContact } from '@/lib/queries/clients';

interface ClientContactsSectionProps {
  clientId: string;
  contacts: ClientContact[];
}

export function ClientContactsSection({
  clientId,
  contacts,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: ClientContactsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState('');
  const [poste, setPoste] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [recoitFactures, setRecoitFactures] = useState(false);
  const [recoitFacturesCc, setRecoitFacturesCc] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    nom: string;
  } | null>(null);

  function resetForm() {
    setNom('');
    setPoste('');
    setEmail('');
    setTelephone('');
    setRecoitFactures(false);
    setRecoitFacturesCc(false);
    setShowForm(false);
  }

  function handleAdd() {
    if (!nom.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    if ((recoitFactures || recoitFacturesCc) && !email.trim()) {
      toast.error('Un email est requis pour recevoir les factures');
      return;
    }

    startTransition(async () => {
      const result = await addClientContact(clientId, {
        nom,
        poste: poste || null,
        email: email || null,
        telephone: telephone || null,
        recoit_factures: recoitFactures,
        recoit_factures_cc: recoitFacturesCc,
      });
      if (result.success) {
        toast.success('Contact ajouté');
        resetForm();
      } else {
        toast.error(result.error ?? "Erreur lors de l'ajout");
      }
    });
  }

  function handleDelete(contactId: string, contactNom: string) {
    setDeleteTarget({ id: contactId, nom: contactNom });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteClientContact(deleteTarget.id, clientId);
      if (result.success) {
        toast.success('Contact supprimé');
        setDeleteTarget(null);
      } else {
        toast.error(result.error ?? 'Erreur lors de la suppression');
      }
    });
  }

  function toggleFlag(
    contactId: string,
    contactEmail: string | null,
    field: 'recoit_factures' | 'recoit_factures_cc',
    nextValue: boolean,
  ) {
    if (nextValue && !contactEmail) {
      toast.error('Ajoutez un email à ce contact avant de cocher cette option');
      return;
    }
    startTransition(async () => {
      const result = await updateClientContact(contactId, clientId, {
        [field]: nextValue,
      });
      if (!result.success) {
        toast.error(result.error ?? 'Erreur lors de la mise à jour');
      }
    });
  }

  const columns = useMemo<ColumnDef<ClientContact>[]>(
    () => [
      {
        accessorKey: 'nom',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Nom" />
        ),
        cell: ({ row }) => (
          <span className="text-sm font-medium">{row.original.nom}</span>
        ),
      },
      {
        accessorKey: 'poste',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Poste" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.poste || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Email" />
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.email || '-'}</span>
        ),
      },
      {
        accessorKey: 'telephone',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Téléphone" />
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.telephone || '-'}</span>
        ),
      },
      {
        accessorKey: 'recoit_factures',
        enableSorting: false,
        header: () => <div className="text-center">Facturation</div>,
        cell: ({ row }) => (
          <div className="text-center">
            <Checkbox
              checked={row.original.recoit_factures ?? false}
              disabled={isPending || !row.original.email}
              onCheckedChange={(v) =>
                toggleFlag(
                  row.original.id,
                  row.original.email,
                  'recoit_factures',
                  v === true,
                )
              }
              aria-label={`Recoit les factures: ${row.original.nom}`}
            />
          </div>
        ),
      },
      {
        accessorKey: 'recoit_factures_cc',
        enableSorting: false,
        header: () => <div className="text-center">Cc</div>,
        cell: ({ row }) => (
          <div className="text-center">
            <Checkbox
              checked={row.original.recoit_factures_cc ?? false}
              disabled={isPending || !row.original.email}
              onCheckedChange={(v) =>
                toggleFlag(
                  row.original.id,
                  row.original.email,
                  'recoit_factures_cc',
                  v === true,
                )
              }
              aria-label={`En copie facturation: ${row.original.nom}`}
            />
          </div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        size: 40,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleDelete(row.original.id, row.original.nom)}
            disabled={isPending}
            aria-label={`Supprimer ${row.original.nom}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPending, clientId],
  );

  return (
    <Card className="mb-6 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4" /> Contacts
        </h3>
        {!showForm && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-2 size-3.5" />
            Ajouter
          </Button>
        )}
      </div>

      {showForm && (
        <div className="bg-muted/50 mb-4 rounded-lg border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Nom *"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
            <Input
              placeholder="Poste"
              value={poste}
              onChange={(e) => setPoste(e.target.value)}
            />
            <Input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              placeholder="Téléphone"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="new-contact-recoit-factures"
                checked={recoitFactures}
                onCheckedChange={(v) => setRecoitFactures(v === true)}
              />
              <Label
                htmlFor="new-contact-recoit-factures"
                className="cursor-pointer text-sm font-normal"
              >
                Reçoit les factures (À)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="new-contact-recoit-factures-cc"
                checked={recoitFacturesCc}
                onCheckedChange={(v) => setRecoitFacturesCc(v === true)}
              />
              <Label
                htmlFor="new-contact-recoit-factures-cc"
                className="cursor-pointer text-sm font-normal"
              >
                En copie (Cc)
              </Label>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetForm}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={isPending}>
              {isPending ? 'Ajout...' : 'Ajouter le contact'}
            </Button>
          </div>
        </div>
      )}

      {contacts.length === 0 && !showForm ? (
        <p className="text-muted-foreground text-sm">Aucun contact</p>
      ) : contacts.length > 0 ? (
        <DataTable
          columns={columns}
          data={contacts}
          searchPlaceholder="Rechercher un contact..."
          paginationMode="auto"
          emptyMessage="Aucun résultat."
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Supprimer le contact"
        description={`Voulez-vous vraiment supprimer le contact "${deleteTarget?.nom}" ? Cette action est irréversible.`}
        confirmText="Supprimer"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        isPending={isPending}
      />
    </Card>
  );
}

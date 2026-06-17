'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Star, ExternalLink } from 'lucide-react';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { textFilterFn } from '@/lib/utils/table-filters';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ContactFormDialog } from './contact-form-dialog';
import { toast } from 'sonner';
import {
  setProspectContactPrincipal,
  deleteProspectContact,
} from '@/lib/actions/prospects';
import {
  ROLE_DECISION_LABELS,
  type RoleDecisionContact,
} from '@/lib/utils/constants';
import type { ProspectContact } from '@/lib/queries/prospects';

interface Props {
  prospectId: string;
  contacts: ProspectContact[];
  contactPrincipalId: string | null;
  locked: boolean;
}

export function FicheInterlocuteurs({
  prospectId,
  contacts,
  contactPrincipalId,
  locked,
}: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProspectContact | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(contact: ProspectContact) {
    setEditing(contact);
    setFormOpen(true);
  }

  function handleSetPrincipal(contactId: string) {
    startTransition(async () => {
      const r = await setProspectContactPrincipal(prospectId, contactId);
      if (r.success) {
        toast.success('Contact principal défini');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const r = await deleteProspectContact(id);
      if (r.success) {
        toast.success('Interlocuteur supprimé');
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  const columns = useMemo<ColumnDef<ProspectContact>[]>(
    () => [
      {
        accessorKey: 'nom',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Nom"
            filterVariant="text"
          />
        ),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.nom}</span>
            {row.original.id === contactPrincipalId && (
              <StatusBadge label="Principal" color="green" />
            )}
          </span>
        ),
        filterFn: textFilterFn,
        enableColumnFilter: true,
      },
      {
        accessorKey: 'poste',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Poste" />
        ),
        cell: ({ row }) => row.original.poste ?? '-',
      },
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Email" />
        ),
        cell: ({ row }) =>
          row.original.email ? (
            <a
              href={`mailto:${row.original.email}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.email}
            </a>
          ) : (
            '-'
          ),
      },
      {
        accessorKey: 'telephone',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Téléphone" />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.telephone ?? '-'}</span>
        ),
      },
      {
        accessorKey: 'role_decision',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Rôle décision" />
        ),
        cell: ({ row }) =>
          row.original.role_decision
            ? ROLE_DECISION_LABELS[
                row.original.role_decision as RoleDecisionContact
              ]
            : '-',
      },
      {
        accessorKey: 'sensibilites',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Sensibilités" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground line-clamp-2 max-w-[16rem] text-xs">
            {row.original.sensibilites ?? '-'}
          </span>
        ),
      },
      {
        id: 'linkedin',
        header: 'LinkedIn',
        cell: ({ row }) =>
          row.original.linkedin ? (
            <a
              href={row.original.linkedin}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary inline-flex items-center gap-1 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3.5" /> Profil
            </a>
          ) : (
            '-'
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const c = row.original;
          const isPrincipal = c.id === contactPrincipalId;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="size-7 p-0"
                disabled={locked || isPending || isPrincipal}
                title={
                  isPrincipal
                    ? 'Déjà contact principal'
                    : 'Définir comme contact principal'
                }
                onClick={() => handleSetPrincipal(c.id)}
              >
                <Star
                  className={
                    isPrincipal
                      ? 'size-3.5 fill-current text-green-600'
                      : 'size-3.5'
                  }
                />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-7 p-0"
                disabled={locked}
                title="Modifier"
                onClick={() => openEdit(c)}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive size-7 p-0"
                disabled={locked}
                title="Supprimer"
                onClick={() => setDeleteTarget(c)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactPrincipalId, locked, isPending],
  );

  return (
    <div className="space-y-4">
      {locked && (
        <p className="text-muted-foreground text-sm">
          Fiche verrouillée : les interlocuteurs sont en lecture seule.
        </p>
      )}

      <DataTable
        columns={columns}
        data={contacts}
        emptyMessage="Aucun interlocuteur."
        paginationMode="auto"
        toolbarExtra={
          <Button size="sm" onClick={openCreate} disabled={locked}>
            <Plus className="mr-1 size-4" />
            Ajouter interlocuteur
          </Button>
        }
      />

      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        prospectId={prospectId}
        contact={editing}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Supprimer l'interlocuteur"
        description={`Supprimer ${deleteTarget?.nom ?? ''} ? Cette action est définitive.`}
        confirmText="Supprimer"
        variant="destructive"
        isPending={isPending}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

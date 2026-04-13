'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { archiveClient, unarchiveClient } from '@/lib/actions/clients';
import { ClientFormDialog } from '@/components/admin/client-form-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { ClientDetail } from '@/lib/queries/clients';

interface ClientDetailActionsProps {
  client: ClientDetail;
}

export function ClientDetailActions({ client }: ClientDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isArchived = !!client.archive;

  function handleConfirm() {
    startTransition(async () => {
      if (isArchived) {
        const result = await unarchiveClient(client.id);
        if (result.success) {
          toast.success('Client restauré');
          setConfirmOpen(false);
          router.refresh();
        } else {
          toast.error(result.error ?? 'Erreur lors de la restauration');
        }
      } else {
        const result = await archiveClient(client.id);
        if (result.success) {
          toast.success('Client archivé');
          setConfirmOpen(false);
          router.push('/admin/clients');
        } else {
          toast.error(result.error ?? "Erreur lors de l'archivage");
        }
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Modifier
        </Button>
        {isArchived ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending}
          >
            <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
            Restaurer
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending}
            className="text-destructive hover:text-destructive"
          >
            <Archive className="mr-2 h-3.5 w-3.5" />
            Archiver
          </Button>
        )}
      </div>
      <ClientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        client={client}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isArchived ? 'Restaurer le client' : 'Archiver le client'}
        description={
          isArchived
            ? `Voulez-vous vraiment restaurer le client "${client.raison_sociale}" ?`
            : `Voulez-vous vraiment archiver le client "${client.raison_sociale}" ? Cette action est réversible.`
        }
        confirmText={isArchived ? 'Restaurer' : 'Archiver'}
        variant={isArchived ? 'default' : 'destructive'}
        onConfirm={handleConfirm}
        isPending={isPending}
      />
    </>
  );
}

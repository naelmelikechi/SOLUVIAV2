'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { archiveClient } from '@/lib/actions/clients';
import { ClientFormDialog } from '@/components/admin/client-form-dialog';
import type { ClientDetail } from '@/lib/queries/clients';

interface ClientDetailActionsProps {
  client: ClientDetail;
}

export function ClientDetailActions({ client }: ClientDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    const confirmed = window.confirm(
      `Voulez-vous vraiment archiver le client "${client.raison_sociale}" ?`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await archiveClient(client.id);
      if (result.success) {
        toast.success('Client archive');
        router.push('/admin/clients');
      } else {
        toast.error(result.error ?? "Erreur lors de l'archivage");
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleArchive}
          disabled={isPending}
          className="text-destructive hover:text-destructive"
        >
          <Archive className="mr-2 h-3.5 w-3.5" />
          {isPending ? 'Archivage...' : 'Archiver'}
        </Button>
      </div>
      <ClientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        client={client}
      />
    </>
  );
}

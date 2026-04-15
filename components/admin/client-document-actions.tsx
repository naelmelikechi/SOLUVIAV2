'use client';

import { useState } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  getDocumentDownloadUrl,
  deleteClientDocument,
} from '@/lib/actions/documents';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

interface ClientDocumentActionsProps {
  documentId: string;
  clientId: string;
  storagePath: string;
  fileName: string;
}

export function ClientDocumentActions({
  documentId,
  clientId,
  storagePath,
  fileName,
}: ClientDocumentActionsProps) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const result = await getDocumentDownloadUrl(storagePath);
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        toast.error(result.error || 'Impossible de telecharger le fichier');
      }
    } catch {
      toast.error('Erreur lors du telechargement');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await deleteClientDocument(documentId, clientId);
      if (result.success) {
        toast.success('Document supprime');
      } else {
        toast.error(result.error || 'Erreur lors de la suppression');
      }
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={downloading}
        onClick={handleDownload}
        title="Telecharger"
        className="h-7 w-7 p-0"
      >
        {downloading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={deleting}
        onClick={() => setConfirmOpen(true)}
        title="Supprimer"
        className="text-destructive hover:text-destructive h-7 w-7 p-0"
      >
        {deleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Supprimer le document"
        description={`Voulez-vous supprimer "${fileName}" ? Cette action est irreversible.`}
        confirmText="Supprimer"
        onConfirm={handleDelete}
      />
    </div>
  );
}

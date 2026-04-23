'use client';

import { useState } from 'react';
import { Download, Eye, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  getDocumentDownloadUrl,
  deleteProjetDocument,
} from '@/lib/actions/documents';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DocumentPreviewSheet } from '@/components/shared/document-preview-sheet';

interface ProjetDocumentActionsProps {
  documentId: string;
  projetRef: string;
  storagePath: string;
  fileName: string;
  typeDocument: string | null;
}

export function ProjetDocumentActions({
  documentId,
  projetRef,
  storagePath,
  fileName,
  typeDocument,
}: ProjetDocumentActionsProps) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function handlePreview() {
    setPreviewLoading(true);
    try {
      const result = await getDocumentDownloadUrl(
        storagePath,
        'project-documents',
      );
      if (result.url) {
        setPreviewUrl(result.url);
        setPreviewOpen(true);
      } else {
        toast.error(result.error || 'Impossible de charger le document');
      }
    } catch {
      toast.error("Erreur lors de l'ouverture du document");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const result = await getDocumentDownloadUrl(
        storagePath,
        'project-documents',
      );
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        toast.error(result.error || 'Impossible de télécharger le fichier');
      }
    } catch {
      toast.error('Erreur lors du téléchargement');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await deleteProjetDocument(documentId, projetRef);
      if (result.success) {
        toast.success('Document supprimé');
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
        disabled={previewLoading}
        onClick={handlePreview}
        title="Aperçu"
        className="h-7 w-7 p-0"
      >
        {previewLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={downloading}
        onClick={handleDownload}
        title="Télécharger"
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
        description={`Voulez-vous supprimer "${fileName}" ? Cette action est irréversible.`}
        confirmText="Supprimer"
        onConfirm={handleDelete}
      />
      <DocumentPreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={previewUrl}
        fileName={fileName}
        typeDocument={typeDocument}
      />
    </div>
  );
}

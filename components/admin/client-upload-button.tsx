'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { uploadClientDocument } from '@/lib/actions/documents';

const ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp';

interface ClientUploadButtonProps {
  clientId: string;
}

export function ClientUploadButton({ clientId }: ClientUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const result = await uploadClientDocument(clientId, formData);

      if (result.success) {
        toast.success('Document uploadé avec succès');
      } else {
        toast.error(result.error || "Erreur lors de l'upload");
      }
    } catch {
      toast.error("Erreur inattendue lors de l'upload");
    } finally {
      setUploading(false);
      // Reset the input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileChange}
        className="hidden"
        aria-label="Sélectionner un fichier"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="mr-2 h-3.5 w-3.5" />
        )}
        {uploading ? 'Upload...' : 'Ajouter'}
      </Button>
    </>
  );
}

'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { importProspectsFromExcel } from '@/lib/actions/prospects';

export function ProspectImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await importProspectsFromExcel(formData);

      if (result.success) {
        const parts = [
          `${result.created ?? 0} créés`,
          `${result.updated ?? 0} mis à jour`,
        ];
        if (result.skipped) parts.push(`${result.skipped} ignorés`);
        toast.success(`Import terminé : ${parts.join(', ')}`);
      } else {
        toast.error(result.error ?? "Erreur lors de l'import");
      }
    } catch {
      toast.error("Erreur inattendue lors de l'import");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Importer un Excel"
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
        {uploading ? 'Import...' : 'Importer Excel'}
      </Button>
    </>
  );
}

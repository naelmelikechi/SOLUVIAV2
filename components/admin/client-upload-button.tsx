'use client';

import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ClientUploadButtonProps {
  clientId: string;
}

export function ClientUploadButton({ clientId }: ClientUploadButtonProps) {
  void clientId;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => toast.info('Upload de documents bientôt disponible')}
    >
      <Upload className="mr-2 h-3.5 w-3.5" />
      Ajouter
    </Button>
  );
}

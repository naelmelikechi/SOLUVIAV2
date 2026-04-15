'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { duplicateProjet } from '@/lib/actions/projets';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

interface ProjetDuplicateButtonProps {
  projetId: string;
  projetRef: string;
}

export function ProjetDuplicateButton({
  projetId,
  projetRef,
}: ProjetDuplicateButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDuplicate() {
    setLoading(true);
    try {
      const result = await duplicateProjet(projetId);
      if (result.success && result.ref) {
        toast.success(`Projet duplique : ${result.ref}`);
        router.push(`/projets/${result.ref}`);
      } else {
        toast.error(result.error || 'Erreur lors de la duplication');
      }
    } catch {
      toast.error('Erreur inattendue lors de la duplication');
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
        title="Dupliquer le projet"
      >
        {loading ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Copy className="mr-2 h-3.5 w-3.5" />
        )}
        Dupliquer
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Dupliquer le projet"
        description={`Dupliquer le projet ${projetRef} ? Un nouveau projet sera cree avec les memes parametres (client, typologie, CDP, commission).`}
        confirmText="Dupliquer"
        onConfirm={handleDuplicate}
      />
    </>
  );
}

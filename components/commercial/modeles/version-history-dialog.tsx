'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils/formatters';
import {
  getTemplateDownloadUrl,
  setActiveTemplateVersion,
} from '@/lib/actions/templates';
import type { TemplateVersionWithPublisher } from '@/lib/queries/templates';

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateNom: string;
  versions: TemplateVersionWithPublisher[];
  isAdmin: boolean;
}

function publisherLabel(
  publisher: TemplateVersionWithPublisher['publisher'],
): string {
  if (!publisher) return 'auteur inconnu';
  return `${publisher.prenom} ${publisher.nom}`.trim();
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  templateNom,
  versions,
  isAdmin,
}: VersionHistoryDialogProps) {
  const { refresh } = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleDownload(versionId: string) {
    const result = await getTemplateDownloadUrl(versionId);
    if (result.url) {
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } else {
      toast.error(result.error ?? 'Lien de téléchargement indisponible');
    }
  }

  function handleReactivate(versionId: string) {
    startTransition(async () => {
      const result = await setActiveTemplateVersion(versionId);
      if (result.success) {
        toast.success('Version réactivée');
        refresh();
      } else {
        toast.error(result.error ?? 'Erreur lors de la réactivation');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Historique des versions</DialogTitle>
          <DialogDescription>{templateNom}</DialogDescription>
        </DialogHeader>

        {versions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucune version publiée pour ce modèle.
          </p>
        ) : (
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={`v${v.version}`} color="blue" />
                  {v.active && <StatusBadge label="Active" color="green" />}
                  <span className="text-muted-foreground text-xs">
                    {v.published_at
                      ? `publiée le ${formatDate(v.published_at)}`
                      : 'publiée'}{' '}
                    par {publisherLabel(v.publisher)}
                  </span>
                </div>

                {v.notes && (
                  <p className="text-foreground text-sm whitespace-pre-wrap">
                    {v.notes}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(v.id)}
                  >
                    <Download className="mr-2 size-3.5" />
                    Télécharger
                  </Button>
                  {isAdmin && !v.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleReactivate(v.id)}
                    >
                      <RotateCcw className="mr-2 size-3.5" />
                      Réactiver cette version
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, History, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils/formatters';
import { getTemplateDownloadUrl } from '@/lib/actions/templates';
import type {
  TemplateWithActive,
  TemplateVersionWithPublisher,
} from '@/lib/queries/templates';
import { PublishVersionDialog } from './publish-version-dialog';
import { VersionHistoryDialog } from './version-history-dialog';

export type TemplateListItem = {
  template: TemplateWithActive;
  versions: TemplateVersionWithPublisher[];
};

interface TemplatesListProps {
  templates: TemplateListItem[];
  isAdmin: boolean;
}

function publisherLabel(
  publisher: TemplateVersionWithPublisher['publisher'],
): string {
  if (!publisher) return 'auteur inconnu';
  return `${publisher.prenom} ${publisher.nom}`.trim();
}

async function openSignedDownload(versionId: string): Promise<void> {
  const result = await getTemplateDownloadUrl(versionId);
  if (result.url) {
    window.open(result.url, '_blank', 'noopener,noreferrer');
  } else {
    toast.error(result.error ?? 'Lien de téléchargement indisponible');
  }
}

export function TemplatesList({ templates, isAdmin }: TemplatesListProps) {
  const [publishItem, setPublishItem] = useState<TemplateListItem | null>(null);
  const [historyItem, setHistoryItem] = useState<TemplateListItem | null>(null);

  if (templates.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Aucun modèle documentaire n’est configuré.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {templates.map((item) => {
          const { template, versions } = item;
          const active = template.active_version;
          return (
            <div
              key={template.id}
              className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="space-y-1.5">
                <h2 className="text-foreground text-base font-semibold">
                  {template.nom}
                </h2>
                {template.description && (
                  <p className="text-muted-foreground text-sm">
                    {template.description}
                  </p>
                )}
                {active ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <StatusBadge label={`v${active.version}`} color="green" />
                    <span className="text-muted-foreground">
                      {active.published_at
                        ? `publiée le ${formatDate(active.published_at)}`
                        : 'publiée'}{' '}
                      par {publisherLabel(active.publisher)}
                    </span>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    Aucune version publiée
                  </p>
                )}
              </div>

              <div className="flex flex-shrink-0 flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!active}
                  onClick={() => {
                    if (active) openSignedDownload(active.id);
                  }}
                >
                  <Download className="mr-2 size-3.5" />
                  Télécharger
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={versions.length === 0}
                  onClick={() => setHistoryItem(item)}
                >
                  <History className="mr-2 size-3.5" />
                  Historique ({template.versions_count})
                </Button>
                {isAdmin && (
                  <Button size="sm" onClick={() => setPublishItem(item)}>
                    <Upload className="mr-2 size-3.5" />
                    Publier une version
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {publishItem && (
        <PublishVersionDialog
          open
          onOpenChange={(open) => {
            if (!open) setPublishItem(null);
          }}
          template={{
            code: publishItem.template.code,
            nom: publishItem.template.nom,
          }}
        />
      )}

      {historyItem && (
        <VersionHistoryDialog
          open
          onOpenChange={(open) => {
            if (!open) setHistoryItem(null);
          }}
          templateNom={historyItem.template.nom}
          versions={historyItem.versions}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}

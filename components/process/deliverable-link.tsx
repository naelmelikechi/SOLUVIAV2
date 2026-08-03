'use client';

import { useState } from 'react';
import { Eye, ExternalLink, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { extractDriveFileId } from '@/lib/process/drive-url';

interface DeliverableLinkProps {
  libelle: string;
  url: string;
}

const CHIP_CLASS =
  'border-border bg-muted text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-primary inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] transition';

/**
 * Lien vers un livrable de la timeline fiche-guide.
 * Fichier Drive identifiable : bouton « Aperçu » (visionneuse inline en Dialog)
 * + lien « Ouvrir dans Drive » en repli. Sinon : lien externe simple (comportement historique).
 */
export function DeliverableLink({ libelle, url }: DeliverableLinkProps) {
  const label = libelle.replace(/^__(VISUEL|ECRIT)__/, '');
  const id = extractDriveFileId(url);
  const [loaded, setLoaded] = useState(false);

  if (!id) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={CHIP_CLASS}>
        {label}
        <ExternalLink className="size-3 opacity-60" />
      </a>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Dialog>
        <DialogTrigger type="button" className={CHIP_CLASS}>
          <Eye className="size-3 opacity-60" />
          {label}
        </DialogTrigger>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="relative h-[78vh] w-full">
            {!loaded && (
              <div className="text-muted-foreground bg-muted/40 absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-md">
                <Loader2 className="size-6 animate-spin" />
                <span className="text-sm">Chargement de l’aperçu…</span>
              </div>
            )}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onLoad = événement de chargement (masque le loader), pas une interaction */}
            <iframe
              src={`/api/process/drive/${id}`}
              onLoad={() => setLoaded(true)}
              className="h-full w-full rounded-md border"
              title={label}
            />
          </div>
          <DialogFooter className="sm:justify-start">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1.5 text-[12.5px] hover:underline"
            >
              Ouvrir dans Drive
              <ExternalLink className="size-3 opacity-60" />
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <a href={url} target="_blank" rel="noreferrer" className={CHIP_CLASS}>
        <ExternalLink className="size-3 opacity-60" />
        Ouvrir dans Drive
      </a>
    </span>
  );
}

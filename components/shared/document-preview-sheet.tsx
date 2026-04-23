'use client';

import { Download, FileText } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { buttonVariants } from '@/components/ui/button';

interface DocumentPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  fileName: string | null;
  typeDocument: string | null;
}

function isPreviewable(typeDocument: string | null): boolean {
  return typeDocument === 'PDF' || typeDocument === 'Image';
}

export function DocumentPreviewSheet({
  open,
  onOpenChange,
  url,
  fileName,
  typeDocument,
}: DocumentPreviewSheetProps) {
  const canPreview = isPreviewable(typeDocument);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex !w-[min(800px,95vw)] flex-col gap-0 p-0 data-[side=right]:sm:max-w-[min(800px,95vw)]"
      >
        <SheetHeader className="border-border flex flex-row items-center justify-between border-b p-4">
          <SheetTitle className="truncate text-left">
            {fileName || 'Document'}
          </SheetTitle>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Télécharger
            </a>
          )}
        </SheetHeader>

        {!canPreview && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <FileText className="text-muted-foreground h-12 w-12" />
            <div className="space-y-1">
              <p className="text-base font-medium">
                Aperçu indisponible pour ce type de fichier
              </p>
              <p className="text-muted-foreground text-sm">
                Les fichiers Word et Excel ne peuvent pas être affichés
                directement dans le navigateur. Cliquez sur Télécharger pour
                l&apos;ouvrir avec votre logiciel habituel.
              </p>
            </div>
          </div>
        )}

        {canPreview && url && typeDocument === 'PDF' && (
          <iframe
            src={url}
            title={fileName || 'Document'}
            className="h-full w-full flex-1 border-0 bg-white"
          />
        )}

        {canPreview && url && typeDocument === 'Image' && (
          <div className="flex flex-1 items-center justify-center overflow-auto bg-neutral-50 p-4 dark:bg-neutral-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={fileName || 'Image'}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { publishTemplateVersion } from '@/lib/actions/templates';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.csv,.txt';

interface PublishVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: { code: string; nom: string };
}

export function PublishVersionDialog({
  open,
  onOpenChange,
  template,
}: PublishVersionDialogProps) {
  const { refresh } = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = useCallback(
    function handleSubmit() {
      const file = fileInputRef.current?.files?.[0];
      if (!file) {
        toast.error('Veuillez sélectionner un fichier');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('notes', notes);

      startTransition(async () => {
        const result = await publishTemplateVersion(template.code, formData);
        if (result.success) {
          toast.success('Nouvelle version publiée');
          onOpenChange(false);
          refresh();
        } else {
          toast.error(result.error ?? 'Erreur lors de la publication');
        }
      });
    },
    [notes, template.code, onOpenChange, refresh],
  );

  useCmdEnter(handleSubmit, !isPending);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publier une version</DialogTitle>
          <DialogDescription>{template.nom}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="modele_fichier">Fichier du modèle</Label>
            <input
              ref={fileInputRef}
              id="modele_fichier"
              type="file"
              accept={ACCEPT}
              disabled={isPending}
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
              className="border-input file:bg-muted file:text-foreground flex w-full rounded-lg border bg-transparent text-sm outline-none file:mr-3 file:cursor-pointer file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Sélectionner le fichier du modèle"
            />
            {fileName && (
              <p className="text-muted-foreground truncate text-xs">
                {fileName}
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              Taille maximale : 25 Mo. La nouvelle version devient active.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="modele_notes">Notes de version (optionnel)</Label>
            <Textarea
              id="modele_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Changements apportés par cette version…"
              rows={3}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Publication…' : 'Publier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormErrorBanner } from '@/components/shared/form-error-banner';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Message d'erreur affiché au-dessus du footer (FormErrorBanner). */
  error?: string | null;
  /** Libellé du CTA principal. */
  submitLabel: string;
  /** Action du CTA. Omis = pas de footer (le body gère ses propres actions). */
  onSubmit?: () => void;
  isPending?: boolean;
  submitDisabled?: boolean;
  submitVariant?: 'default' | 'destructive';
  cancelLabel?: string;
  /** Largeur du dialog. Les wizards multi-étapes utilisent souvent lg/xl. */
  size?: keyof typeof SIZES;
  /** Contenu additionnel du footer, rendu à gauche des boutons. */
  footerExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shell standard des dialogs de formulaire : header + body + bandeau
 * d'erreur + footer Annuler/CTA avec état pending et Cmd+Entrée.
 * C'est un shell, pas un framework de formulaire : le body reste libre
 * (champs, étapes de wizard, etc.).
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  error,
  submitLabel,
  onSubmit,
  isPending = false,
  submitDisabled = false,
  submitVariant = 'default',
  cancelLabel = 'Annuler',
  size = 'md',
  footerExtra,
  children,
}: FormDialogProps) {
  useCmdEnter(() => {
    if (open && onSubmit && !isPending && !submitDisabled) onSubmit();
  }, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(SIZES[size])}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <FormErrorBanner message={error} />
        {onSubmit && (
          <DialogFooter>
            {footerExtra && <div className="sm:mr-auto">{footerExtra}</div>}
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={submitVariant}
              onClick={onSubmit}
              disabled={isPending || submitDisabled}
            >
              {isPending ? `${submitLabel}…` : submitLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

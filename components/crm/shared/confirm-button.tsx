'use client';
import * as React from 'react';
import { useState, useTransition } from 'react';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Bouton déclenchant une action après confirmation explicite dans un dialog
 * (remplace `confirm()` natif). Réutilisable pour toute opération destructive.
 */
export function ConfirmButton({
  trigger,
  title,
  description,
  confirmLabel = 'Confirmer',
  errorMessage = 'Action impossible',
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  errorMessage?: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(() =>
                runWithToast(onConfirm, {
                  error: errorMessage,
                  onSuccess: () => setOpen(false),
                }),
              )
            }
          >
            {pending ? '…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

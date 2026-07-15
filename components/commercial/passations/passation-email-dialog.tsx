'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  envoyerSyntheseEmail,
  listDestinatairesSynthese,
} from '@/lib/actions/passation';
import { logger } from '@/lib/utils/logger';

interface Destinataire {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: string;
  referent_cdp: boolean;
}

/**
 * Envoi MANUEL du PDF complet par email (décision 2026-07-15 : plus aucun
 * email automatique sur la passation). Destinataires cochés un à un parmi
 * les admins + Référents CDP actifs - le PDF complet porte la section 8,
 * jamais de CDP dans cette liste. Aucune présélection : on décide.
 */
export function PassationEmailDialog({
  syntheseId,
  open,
  onOpenChange,
}: {
  syntheseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // null = pas encore chargé (la liste est chargée à la première ouverture
  // puis conservée : admins/référents actifs, population stable en session).
  const [destinataires, setDestinataires] = useState<Destinataire[] | null>(
    null,
  );
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const loading = open && destinataires === null;

  useEffect(() => {
    if (!open || destinataires !== null) return;
    let cancelled = false;
    listDestinatairesSynthese()
      .then((res) => {
        if (cancelled) return;
        if (res.error) toast.error(res.error);
        setDestinataires(res.destinataires);
      })
      .catch((err) => {
        if (!cancelled)
          logger.error('passation-email-dialog', err, { syntheseId });
      });
    return () => {
      cancelled = true;
    };
  }, [open, destinataires, syntheseId]);

  const toggle = (id: string, checked: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleEnvoyer = () => {
    startTransition(async () => {
      const r = await envoyerSyntheseEmail(syntheseId, [...selection]);
      if (r.success) {
        toast.success(
          `PDF complet envoyé à ${r.sent} destinataire${(r.sent ?? 0) > 1 ? 's' : ''}`,
        );
        setSelection(new Set());
        onOpenChange(false);
      } else {
        toast.error(r.error ?? 'Envoi impossible');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Envoyer la synthèse par email</DialogTitle>
          <DialogDescription>
            PDF complet (sections 1 à 8) en pièce jointe. Destinataires
            éligibles : Direction et Référents CDP actifs - jamais le CDP
            affecté.
          </DialogDescription>
        </DialogHeader>

        {loading || destinataires === null ? (
          <p className="text-muted-foreground text-sm">Chargement...</p>
        ) : destinataires.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun destinataire éligible.
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {destinataires.map((d) => (
              <label
                key={d.id}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5"
              >
                <Checkbox
                  checked={selection.has(d.id)}
                  onCheckedChange={(v) => toggle(d.id, v === true)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {d.prenom} {d.nom}
                    {d.referent_cdp ? (
                      <span className="text-muted-foreground font-normal">
                        {' '}
                        · Référent CDP
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {d.email}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            disabled={isPending || selection.size === 0}
            onClick={handleEnvoyer}
          >
            <Mail className="size-3.5" />
            {isPending
              ? 'Envoi...'
              : `Envoyer${selection.size > 0 ? ` (${selection.size})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

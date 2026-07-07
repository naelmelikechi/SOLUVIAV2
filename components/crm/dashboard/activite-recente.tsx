'use client';
import { useState, useTransition } from 'react';
import { Timeline, type TimelineItem } from '@/components/crm/shared/timeline';
import { Button } from '@/components/crm/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/crm/ui/dialog';
import { loadAllActivites } from '@/lib/crm/actions/activites';

/**
 * Activité récente du dashboard + bouton « Voir tout » qui charge (à la demande)
 * l'historique complet dans une modale.
 */
export function ActiviteRecente({ recentes }: { recentes: TimelineItem[] }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<TimelineItem[] | null>(null);
  const [pending, start] = useTransition();

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o && all === null) {
      start(async () => {
        try {
          setAll(await loadAllActivites());
        } catch {
          setAll([]);
        }
      });
    }
  };

  return (
    <div className="space-y-3">
      <Timeline items={recentes} />
      {recentes.length > 0 && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger
            render={<Button variant="outline" size="sm" className="w-full" />}
          >
            Voir tout
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Toute l&apos;activité</DialogTitle>
            </DialogHeader>
            {pending && all === null ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Chargement…
              </p>
            ) : (
              <Timeline items={all ?? recentes} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

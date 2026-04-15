'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'soluvia-onboarded';

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

function getServerSnapshot(): boolean {
  // During SSR, assume onboarded (don't flash the dialog)
  return true;
}

export function OnboardingDialog() {
  const isOnboarded = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const handleClose = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    for (const cb of listeners) cb();
  }, []);

  return (
    <Dialog
      open={!isOnboarded}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Bienvenue dans l&apos;équipe !
          </DialogTitle>
          <DialogDescription>
            Voici ton espace de travail SOLUVIA. Tout est prêt pour toi.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">📊</span>
            <span>
              <strong>Tableau de bord</strong> - Tes KPIs et alertes en un coup
              d&apos;œil
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">📝</span>
            <span>
              <strong>Projets</strong> - Tes projets de formation et leur
              avancement
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">⏱</span>
            <span>
              <strong>Temps</strong> - Ta feuille de temps hebdomadaire
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">💰</span>
            <span>
              <strong>Facturation</strong> - Émission et suivi des factures
            </span>
          </li>
        </ul>

        <p className="text-muted-foreground text-xs">
          Astuce : tape{' '}
          <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
            ⌘K
          </kbd>{' '}
          pour naviguer rapidement. Pense à compléter ton profil dans Mon
          compte.
        </p>

        <DialogFooter>
          <Button onClick={handleClose}>C&apos;est parti !</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

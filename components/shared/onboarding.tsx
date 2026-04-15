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
          <DialogTitle className="text-lg">Bienvenue sur SOLUVIA</DialogTitle>
          <DialogDescription>
            Votre plateforme de pilotage pour organismes de formation est
            pr&ecirc;te.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">📊</span>
            <span>
              <strong>Tableau de bord</strong> — Vue d&apos;ensemble de vos KPIs
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">📝</span>
            <span>
              <strong>Projets</strong> — Suivi de vos projets de formation
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">⏱</span>
            <span>
              <strong>Temps</strong> — Saisie hebdomadaire avec ventilation par
              axe
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">💰</span>
            <span>
              <strong>Facturation</strong> — &Eacute;mission et suivi des
              factures
            </span>
          </li>
        </ul>

        <p className="text-muted-foreground text-xs">
          Raccourci&nbsp;:{' '}
          <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
            ⌘K
          </kbd>{' '}
          pour naviguer rapidement
        </p>

        <DialogFooter>
          <Button onClick={handleClose}>C&apos;est parti !</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

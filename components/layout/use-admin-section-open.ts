'use client';

import { useCallback, useSyncExternalStore } from 'react';

// État replié/déplié de la section Administration de la sidebar, persisté
// entre sessions. Même pattern useSyncExternalStore que use-hidden-kpis :
// hydration-safe (le serveur rend replié) et synchronisé entre onglets.
const STORAGE_KEY = 'soluvia.sidebar.adminOpen.v1';

const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === 'true';
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useAdminSectionOpen() {
  const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(!getSnapshot()));
      listeners.forEach((cb) => cb());
    } catch {
      // no-op (mode privé, etc.)
    }
  }, []);

  return { open, toggle };
}

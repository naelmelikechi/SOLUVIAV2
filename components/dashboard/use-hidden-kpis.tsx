'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'soluvia.dashboard.hiddenKpis.v1';

const listeners = new Set<() => void>();

function getSnapshot(): string {
  if (typeof window === 'undefined') return '[]';
  return window.localStorage.getItem(STORAGE_KEY) ?? '[]';
}

function getServerSnapshot(): string {
  return '[]';
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

function persist(next: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    listeners.forEach((cb) => cb());
  } catch {
    // no-op (private mode, etc.)
  }
}

/**
 * Hook qui gere les KPIs masques par l'utilisateur, persiste en localStorage.
 * Retourne :
 * - hiddenKeys : Set des keys masquees
 * - isHidden(key) : boolean helper
 * - toggle(key) : ajoute/retire la key du masquage
 * - restoreAll() : reset tout
 */
export function useHiddenKpis() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hiddenKeys = useMemo<Set<string>>(() => {
    try {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        return new Set(arr.filter((x): x is string => typeof x === 'string'));
      }
      return new Set();
    } catch {
      return new Set();
    }
  }, [raw]);

  const isHidden = useCallback(
    (key: string) => hiddenKeys.has(key),
    [hiddenKeys],
  );

  const toggle = useCallback(
    (key: string) => {
      const next = new Set(hiddenKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      persist(Array.from(next));
    },
    [hiddenKeys],
  );

  const restoreAll = useCallback(() => {
    persist([]);
  }, []);

  return { hiddenKeys, isHidden, toggle, restoreAll };
}

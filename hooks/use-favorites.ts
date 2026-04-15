'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'soluvia-favorite-projects';

function parseStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  } catch {
    // localStorage might be full or unavailable
  }
}

// Used by useSyncExternalStore for SSR
const emptyArray: string[] = [];
function getServerSnapshot() {
  return emptyArray;
}

let cachedSnapshot: string[] = emptyArray;
function getSnapshot() {
  const next = parseStorage();
  if (
    cachedSnapshot.length === next.length &&
    cachedSnapshot.every((v, i) => v === next[i])
  ) {
    return cachedSnapshot;
  }
  cachedSnapshot = next;
  return cachedSnapshot;
}

// Subscribers notified when we write to localStorage
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify() {
  cachedSnapshot = emptyArray;
  for (const cb of listeners) cb();
}

export function useFavorites() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const favorites = useMemo(() => new Set(snapshot), [snapshot]);

  const toggle = useCallback((id: string) => {
    const current = new Set(parseStorage());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    saveFavorites(current);
    notify();
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.has(id),
    [favorites],
  );

  return { favorites, toggle, isFavorite };
}

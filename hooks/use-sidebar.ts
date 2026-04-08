'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'soluvia-sidebar-collapsed';

let currentValue = false;

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  currentValue = localStorage.getItem(STORAGE_KEY) === 'true';
  return currentValue;
}

function getServerSnapshot(): boolean {
  return false;
}

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function useSidebar() {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const toggle = useCallback(() => {
    const next = !getSnapshot();
    localStorage.setItem(STORAGE_KEY, String(next));
    emitChange();
  }, []);

  return { collapsed, toggle };
}

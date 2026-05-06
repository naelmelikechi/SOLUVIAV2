'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'soluvia.timegrid.columns.v1';

export interface ColumnWidths {
  projet: number;
  day: number;
  total: number;
}

const DEFAULT_WIDTHS: ColumnWidths = {
  projet: 260,
  day: 104,
  total: 72,
};

const MIN_WIDTHS: ColumnWidths = {
  projet: 120,
  day: 60,
  total: 50,
};

function clamp(n: number, min: number): number {
  return Math.max(min, Math.round(n));
}

// Source externe (localStorage + listeners locaux). Pattern useSyncExternalStore
// pour eviter le warning react-hooks/set-state-in-effect tout en gardant
// la cohesion SSR (server -> default, client -> valeur du storage).
const listeners = new Set<() => void>();

function getSnapshot(): string {
  if (typeof window === 'undefined') return JSON.stringify(DEFAULT_WIDTHS);
  return (
    window.localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(DEFAULT_WIDTHS)
  );
}

function getServerSnapshot(): string {
  return JSON.stringify(DEFAULT_WIDTHS);
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

function persist(next: ColumnWidths) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    listeners.forEach((cb) => cb());
  } catch {
    // no-op : private mode, quota exceeded, etc.
  }
}

/**
 * Hook qui gere les largeurs persistantes des colonnes de la fiche de temps.
 * 3 buckets resizables : projet (premiere colonne), day (uniforme sur les 5 jours),
 * total (derniere colonne). Persiste en localStorage via useSyncExternalStore.
 */
export function useColumnWidths() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const widths = useMemo<ColumnWidths>(() => {
    try {
      const parsed = JSON.parse(raw) as Partial<ColumnWidths>;
      return {
        projet: clamp(
          parsed.projet ?? DEFAULT_WIDTHS.projet,
          MIN_WIDTHS.projet,
        ),
        day: clamp(parsed.day ?? DEFAULT_WIDTHS.day, MIN_WIDTHS.day),
        total: clamp(parsed.total ?? DEFAULT_WIDTHS.total, MIN_WIDTHS.total),
      };
    } catch {
      return DEFAULT_WIDTHS;
    }
  }, [raw]);

  const startDrag = useCallback(
    (key: keyof ColumnWidths, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const min = MIN_WIDTHS[key];
      const snapshot = JSON.parse(getSnapshot()) as Partial<ColumnWidths>;
      const startWidth = clamp(
        snapshot[key] ?? DEFAULT_WIDTHS[key],
        MIN_WIDTHS[key],
      );

      const onMove = (e: MouseEvent) => {
        const delta = e.clientX - startX;
        const current = JSON.parse(getSnapshot()) as Partial<ColumnWidths>;
        persist({
          projet: clamp(
            current.projet ?? DEFAULT_WIDTHS.projet,
            MIN_WIDTHS.projet,
          ),
          day: clamp(current.day ?? DEFAULT_WIDTHS.day, MIN_WIDTHS.day),
          total: clamp(current.total ?? DEFAULT_WIDTHS.total, MIN_WIDTHS.total),
          [key]: Math.max(min, Math.round(startWidth + delta)),
        });
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [],
  );

  return { widths, startDrag };
}

/**
 * Poignee de resize : zone droite de 6px sur le bord droit du <th>.
 * Capte mousedown pour declencher le drag.
 */
export function ResizeHandle({
  onMouseDown,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      className="hover:bg-primary/40 absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize select-none"
      aria-hidden
    />
  );
}

/** @vitest-environment jsdom */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression (audit #122, constat 12a) : la grille de temps perdait la derniere
 * cellule saisie.
 *
 * Le cleanup du useEffect (dependances [], donc au demontage) faisait
 * clearTimeout sur les timers en attente, alors que la sauvegarde est un
 * setTimeout de 2 s. L'input etant NON controle et la sauvegarde partant sur
 * onBlur, c'est le clic sur un lien de navigation qui declenche le blur, puis le
 * demontage qui tue la fenetre. « Je tape ma derniere valeur puis je clique
 * ailleurs » est le geste de fin de saisie normal, pas un enchainement
 * improbable. Aucun beforeunload dans le depot.
 */

// Node v25+ expose un localStorage global vide qui shadow celui de jsdom, et
// useColumnWidths lit dedans. Meme mock que __tests__/use-favorites.test.tsx.
function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
}
const mockStorage = createMockStorage();
vi.stubGlobal('localStorage', mockStorage);
Object.defineProperty(window, 'localStorage', {
  value: mockStorage,
  configurable: true,
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const saveSaisieTempsMock = vi.fn(async () => ({ success: true as const }));
vi.mock('@/lib/actions/temps', () => ({
  saveSaisieTemps: (...args: unknown[]) => saveSaisieTempsMock(...(args as [])),
}));

import { TimeGrid } from '@/components/temps/time-grid';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  saveSaisieTempsMock.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

const WEEK = [
  '2026-08-03',
  '2026-08-04',
  '2026-08-05',
  '2026-08-06',
  '2026-08-07',
  '2026-08-08',
  '2026-08-09',
];

const SAISIES = [
  {
    projet_id: 'p1',
    projet_ref: '0001-DUP-APP',
    projet_label: 'Dupont SARL',
    est_interne: false,
    categorie_interne: null,
    heures: {},
    axes: {},
  },
];

function renderGrid() {
  return render(
    <TimeGrid
      weekDates={WEEK}
      initialSaisies={SAISIES}
      onSaveHours={() => {}}
    />,
  );
}

describe('TimeGrid : sauvegarde en attente au demontage', () => {
  it('la derniere cellule saisie est sauvegardee meme si on navigue avant les 2 s', () => {
    const { unmount } = renderGrid();

    const cellule = screen.getAllByLabelText(
      'Saisie du temps en heures',
    )[0] as HTMLInputElement;
    fireEvent.change(cellule, { target: { value: '7' } });
    // Le blur est ce que declenche le clic sur un lien de navigation.
    fireEvent.blur(cellule);

    // On n'a pas encore atteint la fenetre de debounce (2 s).
    vi.advanceTimersByTime(1500);
    expect(saveSaisieTempsMock).not.toHaveBeenCalled();

    // Navigation : le composant est demonte pendant la fenetre.
    unmount();
    vi.advanceTimersByTime(5000);

    // AVANT le correctif : zero appel, la saisie etait perdue.
    expect(saveSaisieTempsMock).toHaveBeenCalledTimes(1);
    expect(saveSaisieTempsMock).toHaveBeenCalledWith('p1', '2026-08-03', 7);
  });

  it('le chemin normal (2 s ecoulees, sans demontage) ne sauvegarde qu une fois', () => {
    renderGrid();

    const cellule = screen.getAllByLabelText(
      'Saisie du temps en heures',
    )[0] as HTMLInputElement;
    fireEvent.change(cellule, { target: { value: '3h30' } });
    fireEvent.blur(cellule);

    vi.advanceTimersByTime(2500);
    expect(saveSaisieTempsMock).toHaveBeenCalledTimes(1);
    expect(saveSaisieTempsMock).toHaveBeenCalledWith('p1', '2026-08-03', 3.5);

    // Anti-regression du flush : le payload doit avoir ete retire une fois
    // joue, sinon le demontage le rejouerait une seconde fois.
    cleanup();
    vi.advanceTimersByTime(5000);
    expect(saveSaisieTempsMock).toHaveBeenCalledTimes(1);
  });
});

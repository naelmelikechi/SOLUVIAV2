// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const STORAGE_KEY = 'soluvia-favorite-projects';

// Node v25+ expose un localStorage global vide qui shadow celui de jsdom.
// On installe un mock complet sur window avant tout import du hook.
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

const { useFavorites } = await import('@/hooks/use-favorites');

afterEach(() => cleanup());

describe('useFavorites', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('etat initial : aucun favori', () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites.size).toBe(0);
    expect(result.current.isFavorite('p1')).toBe(false);
  });

  it('toggle ajoute un favori et persiste en localStorage', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggle('p1');
    });
    expect(result.current.isFavorite('p1')).toBe(true);
    expect(JSON.parse(mockStorage.getItem(STORAGE_KEY) ?? '[]')).toContain(
      'p1',
    );
  });

  it('toggle deux fois enleve le favori', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggle('p1');
    });
    act(() => {
      result.current.toggle('p1');
    });
    expect(result.current.isFavorite('p1')).toBe(false);
    expect(JSON.parse(mockStorage.getItem(STORAGE_KEY) ?? '[]')).not.toContain(
      'p1',
    );
  });

  it('hydrate depuis localStorage existant au mount', () => {
    mockStorage.setItem(STORAGE_KEY, JSON.stringify(['p1', 'p2']));
    const { result } = renderHook(() => useFavorites());
    expect(result.current.isFavorite('p1')).toBe(true);
    expect(result.current.isFavorite('p2')).toBe(true);
    expect(result.current.isFavorite('p3')).toBe(false);
  });

  it('ignore un localStorage corrompu (pas de crash)', () => {
    mockStorage.setItem(STORAGE_KEY, 'not-json{');
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites.size).toBe(0);
  });

  it('ignore un localStorage non-array (string, number, object)', () => {
    mockStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites.size).toBe(0);
  });

  it('plusieurs hooks partagent le meme etat (notify)', () => {
    const { result: a } = renderHook(() => useFavorites());
    const { result: b } = renderHook(() => useFavorites());
    act(() => {
      a.current.toggle('p1');
    });
    expect(b.current.isFavorite('p1')).toBe(true);
  });
});

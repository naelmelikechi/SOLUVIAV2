// Required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect } from 'vitest';
import {
  isSyncBudgetExceeded,
  orderKeysByLastSyncedAt,
  SYNC_TIME_BUDGET_MS,
} from '@/lib/eduvia/sync';

/**
 * Tests des fonctions pures du budget temps + rotation anti-famine de
 * syncAllEduviaClients (lib/eduvia/sync.ts).
 */

describe('isSyncBudgetExceeded', () => {
  it('false tant que le budget n est pas atteint', () => {
    const t0 = 1_000_000;
    expect(isSyncBudgetExceeded(t0, t0)).toBe(false);
    expect(isSyncBudgetExceeded(t0, t0 + SYNC_TIME_BUDGET_MS - 1)).toBe(false);
  });

  it('true des que le budget est atteint ou depasse', () => {
    const t0 = 1_000_000;
    expect(isSyncBudgetExceeded(t0, t0 + SYNC_TIME_BUDGET_MS)).toBe(true);
    expect(isSyncBudgetExceeded(t0, t0 + SYNC_TIME_BUDGET_MS + 60_000)).toBe(
      true,
    );
  });

  it('respecte un budget custom', () => {
    expect(isSyncBudgetExceeded(0, 999, 1000)).toBe(false);
    expect(isSyncBudgetExceeded(0, 1000, 1000)).toBe(true);
  });

  it('budget par defaut = 240s (marge sous maxDuration 300s)', () => {
    expect(SYNC_TIME_BUDGET_MS).toBe(240_000);
  });
});

describe('orderKeysByLastSyncedAt', () => {
  it('NULLS FIRST puis last_synced_at croissant (les moins recents d abord)', () => {
    const keys = [
      { id: 'c', last_synced_at: '2026-07-02T10:00:00Z' },
      { id: 'a', last_synced_at: null },
      { id: 'b', last_synced_at: '2026-07-01T09:00:00Z' },
    ];
    expect(orderKeysByLastSyncedAt(keys).map((k) => k.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('tri stable : les ex-aequo (tous null) gardent l ordre d origine', () => {
    const keys = [
      { id: 'k1', last_synced_at: null },
      { id: 'k2', last_synced_at: null },
      { id: 'k3', last_synced_at: null },
    ];
    expect(orderKeysByLastSyncedAt(keys).map((k) => k.id)).toEqual([
      'k1',
      'k2',
      'k3',
    ]);
  });

  it('ne mute pas le tableau d entree', () => {
    const keys = [
      { id: 'b', last_synced_at: '2026-07-02T10:00:00Z' },
      { id: 'a', last_synced_at: null },
    ];
    const sorted = orderKeysByLastSyncedAt(keys);
    expect(sorted).not.toBe(keys);
    expect(keys.map((k) => k.id)).toEqual(['b', 'a']);
  });

  it('rotation anti-famine : le client traite en dernier repasse en tete apres maj du curseur', () => {
    // Run 1 : ordre a, b, c. On tente a et b (curseur avance), c est reporte.
    const run1 = orderKeysByLastSyncedAt([
      { id: 'a', last_synced_at: '2026-07-02T08:00:00Z' },
      { id: 'b', last_synced_at: '2026-07-02T08:01:00Z' },
      { id: 'c', last_synced_at: '2026-07-02T08:02:00Z' },
    ]);
    expect(run1.map((k) => k.id)).toEqual(['a', 'b', 'c']);
    // Run 2 : a et b ont un curseur frais, c (reporte) est le plus ancien.
    const run2 = orderKeysByLastSyncedAt([
      { id: 'a', last_synced_at: '2026-07-02T09:00:00Z' },
      { id: 'b', last_synced_at: '2026-07-02T09:01:00Z' },
      { id: 'c', last_synced_at: '2026-07-02T08:02:00Z' },
    ]);
    expect(run2.map((k) => k.id)[0]).toBe('c');
  });
});

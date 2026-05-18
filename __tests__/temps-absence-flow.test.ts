process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Test d integration "supprimer un conge" bout-en-bout au niveau des
 * Server Actions. Demontre le scenario exact remonte par l utilisateur :
 *
 *   1. utilisateur sur semaine N (N != 0)
 *   2. cree une absence
 *   3. fetchAbsencesForWeek retourne l absence
 *   4. supprime l absence
 *   5. fetchAbsencesForWeek (sur la MEME semaine) retourne []
 *
 * Avant les correctifs : etape 5 retournait encore l absence parce que
 * la page rerendait la semaine 0 via router.refresh() au lieu de
 * rafraichir la semaine vue.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/utils/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// in-memory tables
type AbsenceRow = {
  id: string;
  user_id: string;
  type: 'conges' | 'maladie';
  date_debut: string;
  date_fin: string;
  demi_jour_debut: boolean;
  demi_jour_fin: boolean;
};

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

function makeUuid(seq: number): string {
  // RFC4122-compatible test UUIDs (deterministic for tests).
  const hex = seq.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

function makeInMemorySupabase() {
  const store: { absences: AbsenceRow[] } = { absences: [] };
  let idSeq = 1;

  // Build a single chainable query object. The methods we need are:
  // .select(), .eq(col,val), .neq(col,val), .lte(col,val), .gte(col,val),
  // .in(col,vals), .order(col,opts), .limit(n), .single(), .maybeSingle(),
  // .insert(rows).select().single(), .delete().eq(col,val).
  function tableOps(table: 'absences') {
    let filtered: AbsenceRow[] = [...store[table]];
    let limited = false;
    let inserting: AbsenceRow[] | null = null;
    let deleting = false;
    let returnRow = false;

    const applyResolve = (): { data: unknown; error: unknown } => {
      if (deleting) {
        const survivors = store[table].filter(
          (r) => !filtered.includes(r as AbsenceRow),
        );
        store[table] = survivors as AbsenceRow[];
        return { data: null, error: null };
      }
      if (inserting) {
        const created = inserting.map((row) => ({
          ...row,
          id: row.id ?? makeUuid(idSeq++),
        }));
        store[table].push(...(created as AbsenceRow[]));
        return {
          data: returnRow ? created[0] : created,
          error: null,
        };
      }
      const out = limited ? filtered.slice(0, 1) : filtered;
      return { data: returnRow ? (out[0] ?? null) : out, error: null };
    };

    const chain: Record<string, unknown> = {
      select() {
        return chain;
      },
      eq(col: keyof AbsenceRow, val: unknown) {
        filtered = filtered.filter((r) => r[col] === val);
        return chain;
      },
      neq(col: keyof AbsenceRow, val: unknown) {
        filtered = filtered.filter((r) => r[col] !== val);
        return chain;
      },
      lte(col: keyof AbsenceRow, val: unknown) {
        filtered = filtered.filter(
          (r) => (r[col] as string) <= (val as string),
        );
        return chain;
      },
      gte(col: keyof AbsenceRow, val: unknown) {
        filtered = filtered.filter(
          (r) => (r[col] as string) >= (val as string),
        );
        return chain;
      },
      in(col: keyof AbsenceRow, vals: unknown[]) {
        filtered = filtered.filter((r) => vals.includes(r[col]));
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        limited = true;
        return chain;
      },
      single() {
        returnRow = true;
        return Promise.resolve(applyResolve());
      },
      maybeSingle() {
        returnRow = true;
        return Promise.resolve(applyResolve());
      },
      insert(rows: AbsenceRow | AbsenceRow[]) {
        inserting = Array.isArray(rows) ? rows : [rows];
        return chain;
      },
      delete() {
        deleting = true;
        // For delete, the chained eq filters apply to `filtered`, which
        // currently mirrors the full table - filters narrow it before
        // resolve runs.
        return chain;
      },
      then(cb: (v: { data: unknown; error: unknown }) => unknown) {
        return Promise.resolve(applyResolve()).then(cb);
      },
    };
    return chain;
  }

  const auth = {
    async getUser() {
      return {
        data: { user: { id: TEST_USER_ID, email: 't@example.com' } },
      };
    },
  };

  return {
    store,
    client: {
      auth,
      from(table: string) {
        if (table === 'users') {
          // Mock minimal users profile for requireUser guard.
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            single() {
              return Promise.resolve({
                data: { role: 'admin', actif: true },
                error: null,
              });
            },
          };
        }
        if (table !== 'absences') {
          throw new Error(`Unexpected table in in-memory mock: ${table}`);
        }
        return tableOps(table);
      },
    },
  };
}

import { createClient } from '@/lib/supabase/server';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Flow absence: create -> fetch -> delete -> refetch', () => {
  it('delete sur une semaine N reflete bien dans le refetch suivant', async () => {
    const mock = makeInMemorySupabase();
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { createAbsenceAction, deleteAbsenceAction } =
      await import('@/lib/actions/absences');
    const { fetchAbsencesForWeek } = await import('@/lib/actions/temps');

    // Semaine cible : 2026-05-25 (lun) -> 2026-05-31 (dim) - dans le futur,
    // exactement le scenario "supprimer un conge sur une autre semaine"
    const week = [
      '2026-05-25',
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
      '2026-05-30',
      '2026-05-31',
    ];

    // 1. Create
    const created = await createAbsenceAction({
      type: 'conges',
      date_debut: '2026-05-26',
      date_fin: '2026-05-26',
    });
    expect(created.success).toBe(true);
    expect(created.id).toBeTruthy();
    expect(mock.store.absences).toHaveLength(1);

    // 2. Fetch -> visible
    const before = await fetchAbsencesForWeek(week);
    expect(before).toHaveLength(1);
    expect(before[0]!.id).toBe(created.id);

    // 3. Delete
    const deleted = await deleteAbsenceAction(created.id!);
    expect(deleted.success).toBe(true);
    expect(mock.store.absences).toHaveLength(0);

    // 4. Refetch sur la MEME semaine -> disparu (c est le bug originel :
    // le refetch tapait sur la semaine 0 et ne montrait jamais le delete)
    const after = await fetchAbsencesForWeek(week);
    expect(after).toEqual([]);
  });

  it('createAbsenceAction refuse un chevauchement', async () => {
    const mock = makeInMemorySupabase();
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { createAbsenceAction } = await import('@/lib/actions/absences');

    await createAbsenceAction({
      type: 'conges',
      date_debut: '2026-05-25',
      date_fin: '2026-05-27',
    });
    const second = await createAbsenceAction({
      type: 'maladie',
      date_debut: '2026-05-27',
      date_fin: '2026-05-29',
    });
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/existe deja|existe déjà/i);
    expect(mock.store.absences).toHaveLength(1);
  });

  it('fetchAbsencesForWeek hors fenetre -> []', async () => {
    const mock = makeInMemorySupabase();
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { createAbsenceAction } = await import('@/lib/actions/absences');
    const { fetchAbsencesForWeek } = await import('@/lib/actions/temps');

    await createAbsenceAction({
      type: 'conges',
      date_debut: '2026-05-26',
      date_fin: '2026-05-26',
    });

    const otherWeek = [
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      '2026-06-07',
    ];
    const result = await fetchAbsencesForWeek(otherWeek);
    expect(result).toEqual([]);
  });
});

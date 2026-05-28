// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth/guards', () => ({
  checkAuth: () => requireAdminMock(),
}));

const mockUser = { id: 'user-admin-1', email: 'admin@test.com' };

// ---------------------------------------------------------------------------
// Helper : construit un mock supabase pour les actions opcos.
//
// Sequence des appels selon l'action :
//
// createOpco :
//   1. opcos.select('id, code, prefixes_deca').eq('actif', true).overlaps(...) -> collision check
//   2. opcos.insert({ ... }).select('id').single()                              -> insert
//
// updateOpco :
//   1. opcos.select('id, code, prefixes_deca').eq('actif', true).overlaps(...).neq('id', id) -> collision check
//   2. opcos.update({ ... }).eq('id', id)                                                     -> update
//
// archiveOpco :
//   1. opcos.update({ actif: false }).eq('id', id)                             -> archive
//
// unarchiveOpco :
//   1. opcos.select('prefixes_deca').eq('id', id).single()                     -> fetch opco
//   2. opcos.select('id, code, prefixes_deca').eq('actif', true).overlaps(...).neq('id', id) -> collision
//   3. opcos.update({ actif: true }).eq('id', id)                              -> unarchive
// ---------------------------------------------------------------------------

interface OpcoRow {
  id: string;
  code: string;
  prefixes_deca: string[];
}

interface BuildOpts {
  // collision check : opcos existants qui overlappent (vide = pas de collision)
  collisionOpcos?: OpcoRow[];
  // insert resultat
  insertedId?: string;
  insertError?: { message: string };
  // update/archive error
  updateError?: { message: string };
  // fetch opco pour unarchive
  fetchedOpco?: { prefixes_deca: string[] } | null;
  fetchError?: { message: string };
}

function buildSupabase(opts: BuildOpts = {}) {
  // On track les appels pour assertions
  const calls: Array<{ type: string; table: string; payload?: unknown }> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeChain(table: string, chainType: string): any {
    const chain: Record<string, unknown> = {};

    // select() -> retourne chain avec eq, overlaps, neq, single, then
    chain.select = (cols?: string) => {
      calls.push({ type: 'select', table, payload: cols });
      const selectChain: Record<string, unknown> = {};

      selectChain.eq = (_col: string, _val: unknown) => {
        // .eq('actif', true) ou .eq('id', id) dans le fetch unarchive
        const eqChain: Record<string, unknown> = {};

        eqChain.overlaps = (colName: string, vals: string[]) => {
          calls.push({ type: 'overlaps', table, payload: { colName, vals } });
          const overlapChain: Record<string, unknown> = {};

          // .neq('id', excludeId) -> collision check avec exclusion
          overlapChain.neq = (_col: string, _val: string) => {
            return Promise.resolve({
              data: opts.collisionOpcos ?? [],
              error: null,
            });
          };

          // collision check sans exclusion (createOpco)
          overlapChain.then = (resolve: (v: unknown) => unknown) => {
            return Promise.resolve({
              data: opts.collisionOpcos ?? [],
              error: null,
            }).then(resolve);
          };

          return overlapChain;
        };

        // .single() -> fetch opco pour unarchive
        eqChain.single = () => {
          if (opts.fetchError) {
            return Promise.resolve({ data: null, error: opts.fetchError });
          }
          if (opts.fetchedOpco === undefined) {
            // Par defaut : pas de fetch opco attendu
            return Promise.resolve({
              data: { prefixes_deca: ['001'] },
              error: null,
            });
          }
          return Promise.resolve({ data: opts.fetchedOpco, error: null });
        };

        return eqChain;
      };

      return selectChain;
    };

    // insert() -> retourne chain avec select
    chain.insert = (payload: unknown) => {
      calls.push({ type: 'insert', table, payload });
      return {
        select: (_cols: string) => ({
          single: () => {
            if (opts.insertError) {
              return Promise.resolve({ data: null, error: opts.insertError });
            }
            return Promise.resolve({
              data: { id: opts.insertedId ?? 'new-opco-id' },
              error: null,
            });
          },
        }),
      };
    };

    // update() -> retourne chain avec eq
    chain.update = (payload: unknown) => {
      calls.push({ type: 'update', table, payload });
      return {
        eq: (_col: string, _val: string) => {
          return Promise.resolve({ error: opts.updateError ?? null });
        },
      };
    };

    // Pour les cas ou l'appel est awaite directement (overlaps sans neq)
    chain.then = (resolve: (v: unknown) => unknown) => {
      return Promise.resolve({ data: [], error: null }).then(resolve);
    };

    void chainType; // suppress unused warning
    return chain;
  }

  const client = {
    from: (table: string) => makeChain(table, 'root'),
  };

  return { client, calls };
}

beforeEach(() => {
  requireAdminMock.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('opcos actions CRUD', () => {
  it('1. createOpco cas nominal succes', async () => {
    const { client } = buildSupabase({ insertedId: 'opco-created-1' });
    requireAdminMock.mockResolvedValue({
      ok: true,
      supabase: client,
      user: mockUser,
    });

    const { createOpco } = await import('@/lib/actions/opcos');
    const result = await createOpco({
      code: 'AKTO',
      nom: 'AKTO Commerce',
      prefixesDeca: ['017', '018'],
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('opco-created-1');
  });

  it('2. createOpco refuse code mal formate (minuscules)', async () => {
    // Pas besoin de mock supabase : la validation Zod court-circuite avant
    requireAdminMock.mockResolvedValue({
      ok: true,
      supabase: {} as never,
      user: mockUser,
    });

    const { createOpco } = await import('@/lib/actions/opcos');
    const result = await createOpco({
      code: 'akto', // minuscules -> invalide
      nom: 'AKTO Commerce',
      prefixesDeca: ['017'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/majuscules/i);
  });

  it('3. createOpco refuse prefixe mal formate (4 chiffres)', async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      supabase: {} as never,
      user: mockUser,
    });

    const { createOpco } = await import('@/lib/actions/opcos');
    const result = await createOpco({
      code: 'AKTO',
      nom: 'AKTO Commerce',
      prefixesDeca: ['0170'], // 4 chiffres -> invalide
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/3 chiffres/i);
  });

  it('4. createOpco collision avec OPCO actif existant -> refus', async () => {
    const { client } = buildSupabase({
      collisionOpcos: [
        { id: 'other-opco-id', code: 'OPCO2I', prefixes_deca: ['017'] },
      ],
    });
    requireAdminMock.mockResolvedValue({
      ok: true,
      supabase: client,
      user: mockUser,
    });

    const { createOpco } = await import('@/lib/actions/opcos');
    const result = await createOpco({
      code: 'AKTO',
      nom: 'AKTO Commerce',
      prefixesDeca: ['017'], // prefixe deja pris par OPCO2I
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/OPCO2I/);
    expect(result.error).toMatch(/Prefixe deja utilise/);
  });

  it('5. createOpco non-admin -> refus', async () => {
    requireAdminMock.mockResolvedValue({
      ok: false,
      error: 'Acces refuse - reserve aux admins',
    });

    const { createOpco } = await import('@/lib/actions/opcos');
    const result = await createOpco({
      code: 'AKTO',
      nom: 'AKTO Commerce',
      prefixesDeca: ['017'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/refus/i);
  });

  it('6. archiveOpco cas nominal', async () => {
    const { client } = buildSupabase();
    requireAdminMock.mockResolvedValue({
      ok: true,
      supabase: client,
      user: mockUser,
    });

    const { archiveOpco } = await import('@/lib/actions/opcos');
    const result = await archiveOpco('aaaaaaaa-aaaa-4aaa-8aaa-000000000001');

    expect(result.success).toBe(true);
  });

  it('7. updateOpco cas nominal sans collision', async () => {
    const { client } = buildSupabase({ collisionOpcos: [] });
    requireAdminMock.mockResolvedValue({
      ok: true,
      supabase: client,
      user: mockUser,
    });

    const { updateOpco } = await import('@/lib/actions/opcos');
    const result = await updateOpco({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',
      code: 'ATLAS',
      nom: 'ATLAS Metiers',
      prefixesDeca: ['022', '023'],
    });

    expect(result.success).toBe(true);
  });
});

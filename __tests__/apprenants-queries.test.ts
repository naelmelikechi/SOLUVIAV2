process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/apprenants.ts.
 *
 * getApprenantsByProjetId fusionne deux sources : les contrats du projet et
 * les apprenants Eduvia rattaches au projet sans contrat. Le point delicat est
 * la deduplication : un apprenant deja porte par un contrat ne doit pas
 * ressortir une seconde fois en "sans contrat".
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { getApprenantsByProjetId } from '@/lib/queries/apprenants';

type Result = { data?: unknown; error?: unknown };

/** Client minimal : renvoie un jeu de donnees different par table. */
function buildSupabase(parTable: Record<string, Result>) {
  const filtres: Array<{ table: string; col: string; val: unknown }> = [];
  const client = {
    from(table: string) {
      const res = parTable[table] ?? {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq(col: string, val: unknown) {
          filtres.push({ table, col, val });
          return chain;
        },
        then: (cb: (v: unknown) => unknown) =>
          Promise.resolve({
            data: res.data ?? null,
            error: res.error ?? null,
          }).then(cb),
      };
      return chain;
    },
  };
  return { client, filtres };
}

const CONTRAT_ENGAGE = {
  id: 'c1',
  apprenant_nom: 'DUPONT',
  apprenant_prenom: 'Alice',
  formation_titre: 'BTS SIO',
  contract_number: 'DECA-1',
  date_debut: '2026-01-01',
  date_fin: '2027-01-01',
  contract_state: 'ENGAGE',
  eduvia_employee_id: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getApprenantsByProjetId', () => {
  it('fusionne contrats et eleves sans contrat, sans doublon', async () => {
    const { client } = buildSupabase({
      contrats: { data: [CONTRAT_ENGAGE] },
      apprenants: {
        data: [
          // Deja porte par le contrat ci-dessus : ne doit pas ressortir.
          { id: 'a1', nom: 'DUPONT', prenom: 'Alice', eduvia_id: 10 },
          { id: 'a2', nom: 'BERNARD', prenom: 'Zoe', eduvia_id: 11 },
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const rows = await getApprenantsByProjetId('p1');

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.source)).toEqual(['contrat', 'sans_contrat']);
    const sansContrat = rows.find((r) => r.source === 'sans_contrat');
    expect(sansContrat).toMatchObject({
      nom: 'BERNARD',
      prenom: 'Zoe',
      date_debut: null,
      date_fin: null,
      contract_state: null,
      contract_number: null,
    });
  });

  it('trie par prenom + nom en francais', async () => {
    const { client } = buildSupabase({
      contrats: {
        data: [
          {
            ...CONTRAT_ENGAGE,
            id: 'c2',
            apprenant_prenom: 'Zoe',
            eduvia_employee_id: 20,
          },
          {
            ...CONTRAT_ENGAGE,
            id: 'c3',
            apprenant_prenom: 'Émile',
            eduvia_employee_id: 21,
          },
          {
            ...CONTRAT_ENGAGE,
            id: 'c4',
            apprenant_prenom: 'Alice',
            eduvia_employee_id: 22,
          },
        ],
      },
      apprenants: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const rows = await getApprenantsByProjetId('p1');

    expect(rows.map((r) => r.prenom)).toEqual(['Alice', 'Émile', 'Zoe']);
  });

  it('filtre sur le projet et exclut les contrats archives', async () => {
    const { client, filtres } = buildSupabase({
      contrats: { data: [] },
      apprenants: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    await getApprenantsByProjetId('p1');

    expect(filtres).toContainEqual({
      table: 'contrats',
      col: 'projet_id',
      val: 'p1',
    });
    expect(filtres).toContainEqual({
      table: 'contrats',
      col: 'archive',
      val: false,
    });
    expect(filtres).toContainEqual({
      table: 'apprenants',
      col: 'projet_id',
      val: 'p1',
    });
  });

  it('remonte une AppError si une des deux requetes echoue', async () => {
    const { client } = buildSupabase({
      contrats: { error: { message: 'boom' } },
      apprenants: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    await expect(getApprenantsByProjetId('p1')).rejects.toThrow(
      'Impossible de charger les apprenants du projet',
    );
  });
});

// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests d'invariants gapless invoice numbering au niveau actions.
 *
 * Ces tests valident que les Server Actions n'attribuent jamais un
 * `ref` / `numero_seq` a une facture qui ne devrait pas en consommer
 * (brouillon vide, double-envoi, suppression d'une emise).
 *
 * Limites connues (a couvrir en Sprint 5+ via tests d'integration SQL):
 * - Le trigger BEFORE UPDATE qui assigne ref + numero_seq atomiquement
 *   en MAX(numero_seq)+1.
 * - Les RLS policies qui bloquent DELETE FROM factures WHERE statut != 'a_emettre'.
 * - La concurrence : deux sendFacture simultanees ne doivent pas obtenir
 *   le meme numero_seq (lock advisory ou serializable transaction).
 *
 * Pour ces invariants DB-level il faut un Supabase local + une migration de
 * test, hors scope de vitest pure.
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

vi.mock('@/lib/email/client', () => ({
  sendEmailForFacture: vi.fn().mockResolvedValue({ success: true }),
}));

const mockUser = { id: 'user-1', email: 'admin@test.com' };
const requireUserMock = vi.fn();
vi.mock('@/lib/auth/guards', () => ({
  requireUser: () => requireUserMock(),
  requireAdmin: () => requireUserMock(),
}));

interface RecordedOp {
  table: string;
  op: 'select' | 'update' | 'delete' | 'insert';
  filters: Array<{ col: string; val: unknown }>;
  payload?: unknown;
}

interface MockRows {
  facture?: { id: string; statut: string; est_avoir?: boolean } | null;
  lignesCount?: number;
  // Si true, les lignes generees auront contract_number vide (declenche le
  // garde DECA OPCO manquant). Par defaut chaque ligne a un DECA valide.
  missingDeca?: boolean;
  updatedFacture?: { id: string; ref: string; statut: string } | null;
  fetchError?: { message: string } | null;
  updateError?: { message: string } | null;
}

/**
 * Construit un mock supabase client : enregistre toutes les operations dans
 * `ops` et retourne des resultats parametrables via `rows`.
 */
function buildSupabaseMock(rows: MockRows) {
  const ops: RecordedOp[] = [];

  function selectChain(op: RecordedOp) {
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ col, val });
        return chain;
      },
      in(col: string, vals: unknown) {
        op.filters.push({ col, val: vals });
        return chain;
      },
      single() {
        if (op.table === 'factures') {
          return Promise.resolve({
            data: rows.facture ?? null,
            error:
              rows.fetchError ??
              (rows.facture ? null : { message: 'not found' }),
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: (v: unknown) => unknown) {
        // Cas chained-then sans .single() : on retourne soit un tableau de
        // lignes (emission.ts lit `data` directement), soit un count (pour
        // les autres callsites historiques).
        if (op.table === 'facture_lignes') {
          const n = rows.lignesCount ?? 0;
          const data = Array.from({ length: n }, (_, i) => ({
            id: `ligne-${i + 1}`,
            contrat: {
              ref: `CTR-0000${i + 1}`,
              contract_number: rows.missingDeca ? '' : `DECA-${i + 1}`,
              apprenant_nom: 'Doe',
              apprenant_prenom: 'John',
            },
          }));
          return Promise.resolve({ data, error: null }).then(resolve);
        }
        return Promise.resolve({
          count: rows.lignesCount ?? 0,
          error: null,
        }).then(resolve);
      },
    };
    return chain;
  }

  function updateChain(op: RecordedOp) {
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ col, val });
        return chain;
      },
      select() {
        return {
          single: () =>
            Promise.resolve({
              data: rows.updatedFacture ?? null,
              error: rows.updateError ?? null,
            }),
        };
      },
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return chain;
  }

  function deleteChain(op: RecordedOp) {
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ col, val });
        return chain;
      },
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return chain;
  }

  return {
    ops,
    client: {
      from(table: string) {
        return {
          select(_cols?: string, _opts?: { count?: string; head?: boolean }) {
            const op: RecordedOp = { table, op: 'select', filters: [] };
            ops.push(op);
            return selectChain(op);
          },
          update(payload: unknown) {
            const op: RecordedOp = {
              table,
              op: 'update',
              filters: [],
              payload,
            };
            ops.push(op);
            return updateChain(op);
          },
          delete() {
            const op: RecordedOp = { table, op: 'delete', filters: [] };
            ops.push(op);
            return deleteChain(op);
          },
          insert(payload: unknown) {
            const op: RecordedOp = {
              table,
              op: 'insert',
              filters: [],
              payload,
            };
            ops.push(op);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
}

beforeEach(() => {
  requireUserMock.mockReset();
});

// ---------------------------------------------------------------------------
// sendFacture
// ---------------------------------------------------------------------------

describe('sendFacture - gapless integrity', () => {
  it('refuse d emettre une facture qui n est PAS un brouillon', async () => {
    const mock = buildSupabaseMock({
      facture: { id: '11111111-1111-4111-8111-111111111111', statut: 'emise' },
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: mock.client,
      user: mockUser,
    });

    const { sendFacture } = await import('@/lib/actions/factures/emission');
    const result = await sendFacture('11111111-1111-4111-8111-111111111111');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/brouillon/i);
    // Aucune mutation : ni update, ni insert, ni delete n'ont ete tentes
    const mutations = mock.ops.filter((o) => o.op !== 'select');
    expect(mutations).toHaveLength(0);
  });

  it('refuse d emettre un brouillon SANS lignes (eviterait gaspiller un numero_seq)', async () => {
    const mock = buildSupabaseMock({
      facture: {
        id: '11111111-1111-4111-8111-111111111111',
        statut: 'a_emettre',
      },
      lignesCount: 0,
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: mock.client,
      user: mockUser,
    });

    const { sendFacture } = await import('@/lib/actions/factures/emission');
    const result = await sendFacture('11111111-1111-4111-8111-111111111111');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ligne/i);
    const mutations = mock.ops.filter((o) => o.op !== 'select');
    expect(mutations).toHaveLength(0);
  });

  it('utilise un optimistic lock sur statut=a_emettre dans le UPDATE (pas de double-send)', async () => {
    const mock = buildSupabaseMock({
      facture: {
        id: '11111111-1111-4111-8111-111111111111',
        statut: 'a_emettre',
        est_avoir: false,
      },
      lignesCount: 3,
      updatedFacture: {
        id: '11111111-1111-4111-8111-111111111111',
        ref: 'FAC-2026-0042',
        statut: 'emise',
      },
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: mock.client,
      user: mockUser,
    });

    const { sendFacture } = await import('@/lib/actions/factures/emission');
    const result = await sendFacture('11111111-1111-4111-8111-111111111111');

    expect(result.success).toBe(true);
    expect(result.ref).toBe('FAC-2026-0042');

    // L'update doit avoir filtre sur statut='a_emettre' (lock optimiste)
    const update = mock.ops.find(
      (o) => o.op === 'update' && o.table === 'factures',
    );
    expect(update).toBeDefined();
    const statutFilter = update!.filters.find((f) => f.col === 'statut');
    expect(statutFilter).toBeDefined();
    expect(statutFilter!.val).toBe('a_emettre');
  });

  it('echoue proprement si l UPDATE ne trouve pas la ligne (race condition)', async () => {
    const mock = buildSupabaseMock({
      facture: {
        id: '11111111-1111-4111-8111-111111111111',
        statut: 'a_emettre',
        est_avoir: false,
      },
      lignesCount: 2,
      updatedFacture: null, // un autre acteur a deja envoye
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: mock.client,
      user: mockUser,
    });

    const { sendFacture } = await import('@/lib/actions/factures/emission');
    const result = await sendFacture('11111111-1111-4111-8111-111111111111');

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteBrouillon
// ---------------------------------------------------------------------------

describe('deleteBrouillon - gapless integrity', () => {
  it('refuse de supprimer une facture EMISE (preserve la sequence)', async () => {
    const mock = buildSupabaseMock({
      facture: { id: '11111111-1111-4111-8111-111111111111', statut: 'emise' },
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: mock.client,
      user: mockUser,
    });

    const { deleteBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await deleteBrouillon(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/brouillon|avoir/i);
    // Aucun delete tente sur factures
    const factureDeletes = mock.ops.filter(
      (o) => o.op === 'delete' && o.table === 'factures',
    );
    expect(factureDeletes).toHaveLength(0);
  });

  it('refuse de supprimer une facture EN_RETARD', async () => {
    const mock = buildSupabaseMock({
      facture: {
        id: '11111111-1111-4111-8111-111111111111',
        statut: 'en_retard',
      },
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: mock.client,
      user: mockUser,
    });

    const { deleteBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await deleteBrouillon(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.success).toBe(false);
  });

  it('refuse de supprimer un AVOIR (sequence avoir gapless)', async () => {
    const mock = buildSupabaseMock({
      facture: { id: '11111111-1111-4111-8111-111111111111', statut: 'avoir' },
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: mock.client,
      user: mockUser,
    });

    const { deleteBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await deleteBrouillon(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.success).toBe(false);
  });

  it('lors d un delete autorise, le DELETE final filtre sur statut=a_emettre (defense en profondeur)', async () => {
    const mock = buildSupabaseMock({
      facture: {
        id: '11111111-1111-4111-8111-111111111111',
        statut: 'a_emettre',
      },
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: mock.client,
      user: mockUser,
    });

    const { deleteBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await deleteBrouillon(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.success).toBe(true);

    // Le DELETE doit avoir un filtre statut='a_emettre' en plus de l'id
    // (defense en profondeur : si la facture passe en 'emise' entre le SELECT
    // et le DELETE, le garde-fou bloque la suppression).
    const factureDelete = mock.ops.find(
      (o) => o.op === 'delete' && o.table === 'factures',
    );
    expect(factureDelete).toBeDefined();
    const statutFilter = factureDelete!.filters.find((f) => f.col === 'statut');
    expect(statutFilter?.val).toBe('a_emettre');
  });
});

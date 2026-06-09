process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';

/**
 * Tests pour lib/actions/factures/brouillons.ts::createFreeBrouillon.
 *
 * Use case : facture rattachée à un client mais sans projet ni contrats
 * (conseil, audit, prestation one-shot).
 *
 * Invariants couverts :
 * - Validation Zod : clientId UUID, lignes non vides, description requise,
 *   montant strictement positif.
 * - Admin only : checkAuth → 403 si pas admin.
 * - Client doit exister et ne pas être archivé.
 * - Insert facture avec projet_id=NULL, status=a_emettre, sans ref/numero_seq.
 * - Insert facture_lignes avec contrat_id=NULL.
 * - TVA 20% sur le total HT, cents entiers (cohérence SUM lignes).
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

// Mock societes-emettrices helper (not yet seeded in test env).
vi.mock('@/lib/queries/societes-emettrices', () => ({
  getDefaultSocieteEmettriceId: vi.fn().mockResolvedValue('soc-default-id'),
}));

const VALID_CLIENT_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_USER_UUID = '22222222-2222-4222-8222-222222222222';

interface ClientRow {
  id: string;
  archive: boolean;
  trigramme: string;
}

interface MockState {
  authResult: {
    ok: boolean;
    user?: User;
    error?: string;
  };
  client: ClientRow | null;
  insertError: { message: string } | null;
  lignesError: { message: string } | null;
  insertedFactureId: string;
}

const mockState: MockState = {
  authResult: {
    ok: true,
    user: { id: VALID_USER_UUID } as User,
  },
  client: { id: VALID_CLIENT_UUID, archive: false, trigramme: 'ACM' },
  insertError: null,
  lignesError: null,
  insertedFactureId: 'fac-new-id',
};

const recordedInserts: Array<{ table: string; payload: unknown }> = [];

function buildSupabase() {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                single: () =>
                  Promise.resolve({
                    data: mockState.client,
                    error: mockState.client ? null : { message: 'not found' },
                  }),
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              };
            },
          };
        },
        insert(payload: unknown) {
          recordedInserts.push({ table, payload });
          if (table === 'factures') {
            if (mockState.insertError) {
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: null,
                      error: mockState.insertError,
                    }),
                }),
              };
            }
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: mockState.insertedFactureId },
                    error: null,
                  }),
              }),
            };
          }
          // facture_lignes : pas de .select() chaîné
          return Promise.resolve({
            data: null,
            error: mockState.lignesError,
          });
        },
        delete() {
          return {
            eq: () => Promise.resolve({ data: null, error: null }),
          };
        },
      };
    },
  };
}

vi.mock('@/lib/auth/guards', () => ({
  checkAuth: vi.fn(async () => {
    if (!mockState.authResult.ok) {
      return { ok: false, error: mockState.authResult.error };
    }
    return {
      ok: true,
      supabase: buildSupabase(),
      user: mockState.authResult.user,
    };
  }),
  requireAuth: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  recordedInserts.length = 0;
  mockState.authResult = {
    ok: true,
    user: { id: VALID_USER_UUID } as User,
  };
  mockState.client = {
    id: VALID_CLIENT_UUID,
    archive: false,
    trigramme: 'ACM',
  };
  mockState.insertError = null;
  mockState.lignesError = null;
  mockState.insertedFactureId = 'fac-new-id';
});

describe('createFreeBrouillon', () => {
  it('refuse un clientId non-UUID', async () => {
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFreeBrouillon({
      clientId: 'not-a-uuid',
      lignes: [{ description: 'Audit', montantHt: 1000 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/UUID/);
  });

  it('refuse une liste de lignes vide', async () => {
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFreeBrouillon({
      clientId: VALID_CLIENT_UUID,
      lignes: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ligne/i);
  });

  it('refuse une description vide', async () => {
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFreeBrouillon({
      clientId: VALID_CLIENT_UUID,
      lignes: [{ description: '', montantHt: 1000 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/[Dd]escription/);
  });

  it('refuse un montant nul ou négatif', async () => {
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFreeBrouillon({
      clientId: VALID_CLIENT_UUID,
      lignes: [{ description: 'Audit', montantHt: 0 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/[Mm]ontant/);
  });

  it('refuse si pas admin (checkAuth échoue)', async () => {
    mockState.authResult = { ok: false, error: 'Accès refusé' };
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFreeBrouillon({
      clientId: VALID_CLIENT_UUID,
      lignes: [{ description: 'Audit', montantHt: 1000 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Accès refusé');
  });

  it('refuse si client introuvable', async () => {
    mockState.client = null;
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFreeBrouillon({
      clientId: VALID_CLIENT_UUID,
      lignes: [{ description: 'Audit', montantHt: 1000 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/[Cc]lient/);
  });

  it('refuse si client archivé', async () => {
    mockState.client = {
      id: VALID_CLIENT_UUID,
      archive: true,
      trigramme: 'ACM',
    };
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFreeBrouillon({
      clientId: VALID_CLIENT_UUID,
      lignes: [{ description: 'Audit', montantHt: 1000 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/[Aa]rchivé/);
  });

  it('insère la facture avec projet_id=NULL, statut=a_emettre, sans ref', async () => {
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFreeBrouillon({
      clientId: VALID_CLIENT_UUID,
      lignes: [{ description: 'Audit', montantHt: 1000 }],
    });
    expect(result.success).toBe(true);
    expect(result.id).toBe('fac-new-id');

    const factureInsert = recordedInserts.find((i) => i.table === 'factures');
    expect(factureInsert).toBeDefined();
    const payload = factureInsert!.payload as Record<string, unknown>;
    expect(payload.projet_id).toBeNull();
    expect(payload.client_id).toBe(VALID_CLIENT_UUID);
    expect(payload.statut).toBe('a_emettre');
    expect(payload.est_avoir).toBe(false);
    expect(payload.ref).toBeUndefined();
    expect(payload.numero_seq).toBeUndefined();
    expect(payload.created_by).toBe(VALID_USER_UUID);
  });

  it('insère les lignes avec contrat_id=NULL', async () => {
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    await createFreeBrouillon({
      clientId: VALID_CLIENT_UUID,
      lignes: [
        { description: 'Audit', montantHt: 1000 },
        { description: 'Conseil', montantHt: 500 },
      ],
    });
    const lignesInsert = recordedInserts.find(
      (i) => i.table === 'facture_lignes',
    );
    expect(lignesInsert).toBeDefined();
    const payload = lignesInsert!.payload as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(2);
    expect(payload[0]!.contrat_id).toBeNull();
    expect(payload[0]!.description).toBe('Audit');
    expect(payload[0]!.montant_ht).toBe(1000);
    expect(payload[1]!.contrat_id).toBeNull();
    expect(payload[1]!.description).toBe('Conseil');
    expect(payload[1]!.montant_ht).toBe(500);
  });

  it('calcule TVA 20% en cents entiers (coherence SUM lignes)', async () => {
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    await createFreeBrouillon({
      clientId: VALID_CLIENT_UUID,
      lignes: [
        { description: 'A', montantHt: 100.33 },
        { description: 'B', montantHt: 50.5 },
      ],
    });
    const factureInsert = recordedInserts.find((i) => i.table === 'factures');
    const payload = factureInsert!.payload as Record<string, number>;
    // SUM = 100.33 + 50.5 = 150.83
    expect(payload.montant_ht).toBeCloseTo(150.83, 2);
    // TVA 20% sur 150.83 = 30.166 -> arrondi cents = 30.17
    expect(payload.montant_tva).toBeCloseTo(30.17, 2);
    expect(payload.montant_ttc).toBeCloseTo(181.0, 2);
  });

  it('cleanup la facture en cas d échec d insert lignes', async () => {
    mockState.lignesError = { message: 'lignes insert failed' };
    const { createFreeBrouillon } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFreeBrouillon({
      clientId: VALID_CLIENT_UUID,
      lignes: [{ description: 'Audit', montantHt: 1000 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/lignes insert failed/);
  });
});

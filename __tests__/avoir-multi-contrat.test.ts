// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockUser = { id: 'user-creator', email: 'admin@test.com' };
const requireUserMock = vi.fn();
vi.mock('@/lib/auth/guards', () => ({
  requireAuth: () => requireUserMock(),
}));

// Mock supabase via createClient (used inside createAvoir + computeProrataAvoir).
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock societes-emettrices helper (not yet seeded in test env).
vi.mock('@/lib/queries/societes-emettrices', () => ({
  getDefaultSocieteEmettriceId: vi.fn().mockResolvedValue('soc-default-id'),
}));

import { createClient } from '@/lib/supabase/server';
import { createAvoir } from '@/lib/actions/factures/avoirs';

interface FactureLigne {
  contrat_id: string;
  contrat: {
    ref: string | null;
    apprenant_nom: string | null;
    apprenant_prenom: string | null;
  } | null;
}

interface BuildOpts {
  origine: {
    id: string;
    ref: string;
    statut: 'emise' | 'en_retard';
    montant_ht: number;
    taux_tva: number;
    est_avoir: boolean;
  };
  origineLignes: FactureLigne[];
  existingAvoir?: { id: string } | null;
  insertedAvoir?: { id: string; ref: string | null };
  ligneInsertError?: { message: string } | null;
}

interface OpRecord {
  type: 'select' | 'insert' | 'delete' | 'update';
  table: string;
  payload?: unknown;
  filters: Array<[string, unknown]>;
}

function buildSupabase(opts: BuildOpts) {
  const ops: OpRecord[] = [];

  function chainSelect(table: string, columns: string) {
    const op: OpRecord = { type: 'select', table, filters: [] };
    ops.push(op);
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push([col, val]);
        return chain;
      },
      maybeSingle() {
        if (table === 'factures' && columns.includes('est_avoir')) {
          // existingAvoir check
          return Promise.resolve({
            data: opts.existingAvoir ?? null,
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        if (table === 'factures' && columns.includes('id, ref, projet_id')) {
          return Promise.resolve({ data: opts.origine, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: (v: unknown) => unknown) {
        // facture_lignes select returns the array
        if (table === 'facture_lignes' && columns.includes('contrat_id')) {
          return Promise.resolve({
            data: opts.origineLignes,
            error: null,
          }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    return chain;
  }

  function chainInsert(table: string, payload: unknown) {
    const op: OpRecord = { type: 'insert', table, payload, filters: [] };
    ops.push(op);
    const chain: Record<string, unknown> = {
      select() {
        return {
          single: () =>
            Promise.resolve({
              data: opts.insertedAvoir ?? { id: 'new-avoir-1', ref: null },
              error: null,
            }),
        };
      },
      then(resolve: (v: unknown) => unknown) {
        if (table === 'facture_lignes') {
          return Promise.resolve({ error: opts.ligneInsertError ?? null }).then(
            resolve,
          );
        }
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return chain;
  }

  function chainDelete(table: string) {
    const op: OpRecord = { type: 'delete', table, filters: [] };
    ops.push(op);
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push([col, val]);
        return chain;
      },
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return chain;
  }

  return {
    client: {
      from(table: string) {
        return {
          select(columns: string) {
            return chainSelect(table, columns);
          },
          insert(payload: unknown) {
            return chainInsert(table, payload);
          },
          delete() {
            return chainDelete(table);
          },
        };
      },
    },
    ops,
  };
}

beforeEach(() => {
  requireUserMock.mockReset();
  vi.mocked(createClient).mockReset();
});

describe('createAvoir - multi-contrat (#6)', () => {
  it('1 ligne origine -> contratId auto-deduit, ligne avoir liee a ce contrat', async () => {
    const sb = buildSupabase({
      origine: {
        id: 'fac-1',
        ref: 'FAC-DUP-0001',
        statut: 'emise',
        montant_ht: 1000,
        taux_tva: 20,
        est_avoir: false,
      },
      origineLignes: [
        {
          contrat_id: 'cccccccc-cccc-4ccc-8ccc-00000000000a',
          contrat: {
            ref: 'CTR-001',
            apprenant_nom: 'Doe',
            apprenant_prenom: 'Jane',
          },
        },
      ],
      insertedAvoir: { id: 'avoir-1', ref: null },
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: mockUser,
    });
    vi.mocked(createClient).mockResolvedValue(
      sb.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createAvoir({
      factureOrigineId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      motif: 'Rupture anticipée',
      montant: 500,
    });

    expect(result.success).toBe(true);
    const ligneInsert = sb.ops.find(
      (o) => o.type === 'insert' && o.table === 'facture_lignes',
    );
    expect(ligneInsert).toBeDefined();
    const payload = ligneInsert!.payload as Record<string, unknown>;
    expect(payload.contrat_id).toBe('cccccccc-cccc-4ccc-8ccc-00000000000a');
    expect(payload.montant_ht).toBe(-500);
    expect(payload.description).toContain('CTR-001');
    expect(payload.description).toContain('Jane Doe');
  });

  it('plusieurs contrats origine sans contratId fourni -> erreur explicite', async () => {
    const sb = buildSupabase({
      origine: {
        id: 'fac-2',
        ref: 'FAC-DUP-0002',
        statut: 'emise',
        montant_ht: 2000,
        taux_tva: 20,
        est_avoir: false,
      },
      origineLignes: [
        {
          contrat_id: 'cccccccc-cccc-4ccc-8ccc-00000000000a',
          contrat: {
            ref: 'CTR-001',
            apprenant_nom: 'Doe',
            apprenant_prenom: 'Jane',
          },
        },
        {
          contrat_id: 'cccccccc-cccc-4ccc-8ccc-00000000000b',
          contrat: {
            ref: 'CTR-002',
            apprenant_nom: 'Smith',
            apprenant_prenom: 'Bob',
          },
        },
      ],
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: mockUser,
    });
    vi.mocked(createClient).mockResolvedValue(
      sb.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createAvoir({
      factureOrigineId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
      motif: 'Rupture anticipée',
      montant: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('2 contrats');
    // Aucune facture n a ete inseree
    expect(
      sb.ops.find((o) => o.type === 'insert' && o.table === 'factures'),
    ).toBeUndefined();
  });

  it('plusieurs contrats origine + contratId fourni -> avoir lie a ce contrat', async () => {
    const sb = buildSupabase({
      origine: {
        id: 'fac-3',
        ref: 'FAC-DUP-0003',
        statut: 'emise',
        montant_ht: 2000,
        taux_tva: 20,
        est_avoir: false,
      },
      origineLignes: [
        {
          contrat_id: 'cccccccc-cccc-4ccc-8ccc-00000000000a',
          contrat: {
            ref: 'CTR-001',
            apprenant_nom: 'Doe',
            apprenant_prenom: 'Jane',
          },
        },
        {
          contrat_id: 'cccccccc-cccc-4ccc-8ccc-00000000000b',
          contrat: {
            ref: 'CTR-002',
            apprenant_nom: 'Smith',
            apprenant_prenom: 'Bob',
          },
        },
      ],
      insertedAvoir: { id: 'avoir-3', ref: null },
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: mockUser,
    });
    vi.mocked(createClient).mockResolvedValue(
      sb.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createAvoir({
      factureOrigineId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
      motif: 'Rupture anticipée',
      montant: 1000,
      contratId: 'cccccccc-cccc-4ccc-8ccc-00000000000b',
    });

    expect(result.success).toBe(true);
    const ligneInsert = sb.ops.find(
      (o) => o.type === 'insert' && o.table === 'facture_lignes',
    );
    expect(ligneInsert).toBeDefined();
    const payload = ligneInsert!.payload as Record<string, unknown>;
    expect(payload.contrat_id).toBe('cccccccc-cccc-4ccc-8ccc-00000000000b');
    expect(payload.description).toContain('CTR-002');
    expect(payload.description).toContain('Bob Smith');
  });

  it('contratId fourni mais n appartient pas aux lignes origine -> erreur', async () => {
    const sb = buildSupabase({
      origine: {
        id: 'fac-4',
        ref: 'FAC-DUP-0004',
        statut: 'emise',
        montant_ht: 2000,
        taux_tva: 20,
        est_avoir: false,
      },
      origineLignes: [
        {
          contrat_id: 'cccccccc-cccc-4ccc-8ccc-00000000000a',
          contrat: {
            ref: 'CTR-001',
            apprenant_nom: 'Doe',
            apprenant_prenom: 'Jane',
          },
        },
      ],
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: mockUser,
    });
    vi.mocked(createClient).mockResolvedValue(
      sb.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createAvoir({
      factureOrigineId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
      motif: 'Erreur de facturation',
      montant: 500,
      contratId: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000099',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n appartient pas/);
  });

  it('rollback : si insert ligne echoue, on supprime l avoir cree (pas de facture orpheline)', async () => {
    const sb = buildSupabase({
      origine: {
        id: 'fac-5',
        ref: 'FAC-DUP-0005',
        statut: 'emise',
        montant_ht: 1000,
        taux_tva: 20,
        est_avoir: false,
      },
      origineLignes: [
        {
          contrat_id: 'cccccccc-cccc-4ccc-8ccc-00000000000a',
          contrat: {
            ref: 'CTR-001',
            apprenant_nom: 'Doe',
            apprenant_prenom: 'Jane',
          },
        },
      ],
      insertedAvoir: { id: 'avoir-5', ref: null },
      ligneInsertError: { message: 'integrity violation' },
    });
    requireUserMock.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: mockUser,
    });
    vi.mocked(createClient).mockResolvedValue(
      sb.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createAvoir({
      factureOrigineId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
      motif: 'Erreur de facturation',
      montant: 200,
    });

    expect(result.success).toBe(false);
    // Le delete sur factures doit avoir ete declenche
    const deleteFacture = sb.ops.find(
      (o) => o.type === 'delete' && o.table === 'factures',
    );
    expect(deleteFacture).toBeDefined();
    expect(deleteFacture!.filters).toContainEqual(['id', 'avoir-5']);
  });
});

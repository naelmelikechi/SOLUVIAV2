// Required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Tests vitest pour /lib/eduvia/sync.ts
 *
 * Couverture cible (sprint 9) :
 *  - syncAllEduviaClients : multi-tenant, skip clé sans URL, skip déchiffrement KO
 *  - syncEduviaForClient  : pré-check status, AuthError, upsert apprenants/contrats,
 *    propagation de erreurs upsert, pas de mélange entre clients (source_client_id),
 *    fallback projet, contrats sans projet actif.
 *
 * Limites connues (skip documenté) :
 *  - Détection des "apprenants supprimés chez Eduvia" : la spec actuelle ne
 *    marque pas archive=true pour les apprenants disparus côté API. Sync.ts
 *    ne fait que des upserts (pas de diff sur la liste reçue). Test skip ci-bas.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const fetchAllPagesMock = vi.fn();
const fetchOneMock = vi.fn();
const fetchListMock = vi.fn();
const fetchStatusMock = vi.fn();

class EndpointNotAvailableError extends Error {
  constructor(public resource: string) {
    super(`Endpoint /api/v1/${resource} pas encore disponible`);
    this.name = 'EndpointNotAvailableError';
  }
}
class AuthError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`Eduvia ${status} auth refusée pour ${url}`);
    this.name = 'AuthError';
  }
}

vi.mock('@/lib/eduvia/client', () => ({
  fetchAllPages: (...args: unknown[]) => fetchAllPagesMock(...args),
  fetchOne: (...args: unknown[]) => fetchOneMock(...args),
  fetchList: (...args: unknown[]) => fetchListMock(...args),
  fetchStatus: (...args: unknown[]) => fetchStatusMock(...args),
  EndpointNotAvailableError,
  AuthError,
}));

const decryptApiKeyMock = vi.fn();
vi.mock('@/lib/utils/encryption', () => ({
  decryptApiKey: (cipher: string) => decryptApiKeyMock(cipher),
}));

const detectNpecMock = vi.fn();
const detectRuptureMock = vi.fn();
vi.mock('@/lib/echeancier/ajustements', () => ({
  detectNpecChangeAjustement: (...args: unknown[]) => detectNpecMock(...args),
  detectRuptureAjustement: (...args: unknown[]) => detectRuptureMock(...args),
}));

// ---------------------------------------------------------------------------
// Supabase mock with chainable query builder
// ---------------------------------------------------------------------------

interface RecordedOp {
  table: string;
  op: 'select' | 'update' | 'upsert' | 'insert' | 'delete';
  filters: Array<{ col: string; val: unknown }>;
  payload?: unknown;
  options?: unknown;
}

interface TableRules {
  select?: () => { data: unknown[] | null; error: unknown };
  upsert?: (
    payload: unknown,
    opts?: unknown,
  ) => { data?: unknown; error: unknown };
  update?: () => { error: unknown };
}

function buildSupabase(rules: Record<string, TableRules>) {
  const ops: RecordedOp[] = [];

  function selectChain(op: RecordedOp, rule?: TableRules['select']) {
    const settle = () => {
      const r = rule ? rule() : { data: [], error: null };
      return Promise.resolve(r);
    };
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ col, val });
        return chain;
      },
      in(col: string, vals: unknown) {
        op.filters.push({ col, val: vals });
        return chain;
      },
      maybeSingle() {
        return settle().then((r) => ({
          data: Array.isArray(r.data) ? (r.data[0] ?? null) : (r.data ?? null),
          error: r.error,
        }));
      },
      single() {
        return settle().then((r) => ({
          data: Array.isArray(r.data) ? (r.data[0] ?? null) : (r.data ?? null),
          error: r.error,
        }));
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return settle().then(resolve, reject);
      },
    };
    return chain;
  }

  function updateChain(op: RecordedOp, rule?: TableRules['update']) {
    const settle = () => Promise.resolve(rule ? rule() : { error: null });
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ col, val });
        return chain;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return settle().then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    ops,
    client: {
      from(table: string) {
        const tableRules = rules[table];
        return {
          select(_cols?: string) {
            const op: RecordedOp = { table, op: 'select', filters: [] };
            ops.push(op);
            return selectChain(op, tableRules?.select);
          },
          upsert(payload: unknown, options?: unknown) {
            const op: RecordedOp = {
              table,
              op: 'upsert',
              filters: [],
              payload,
              options,
            };
            ops.push(op);
            const r = tableRules?.upsert
              ? tableRules.upsert(payload, options)
              : { error: null };
            return Promise.resolve(r);
          },
          update(payload: unknown) {
            const op: RecordedOp = {
              table,
              op: 'update',
              filters: [],
              payload,
            };
            ops.push(op);
            return updateChain(op, tableRules?.update);
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
    } as unknown as SupabaseClient<Database>,
  };
}

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

function learnerFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    first_name: 'Alice',
    last_name: 'Dupont',
    gender: 'F',
    birth_date: '2000-01-01',
    phone_number: '0600000000',
    address: '1 rue X',
    postcode: '75000',
    city: 'Paris',
    country: 'FR',
    nationality_code: 100,
    disabled_worker: false,
    status: 'active',
    company_id: 10,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function projetsRule(projetId = 'projet-A') {
  return {
    select: () => ({
      data: [{ id: projetId, client_id: 'client-X', archive: false }],
      error: null,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchStatusMock.mockResolvedValue({
    status: 'ok',
    version: '1.0.0',
    authenticated: 'ok',
  });
  fetchAllPagesMock.mockResolvedValue([]);
  fetchOneMock.mockRejectedValue(new EndpointNotAvailableError('progressions'));
  fetchListMock.mockRejectedValue(
    new EndpointNotAvailableError('invoice_steps'),
  );
});

// ---------------------------------------------------------------------------
// syncEduviaForClient — happy / partial paths
// ---------------------------------------------------------------------------

describe('syncEduviaForClient — pré-check status', () => {
  it('abort proprement quand /status retourne authenticated != ok', async () => {
    fetchStatusMock.mockResolvedValue({
      status: 'ok',
      version: '1.0',
      authenticated: 'ko',
    });
    const supa = buildSupabase({ projets: projetsRule() });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      'client-X',
      'cfa.eduvia.app',
      'token-bidon',
    );

    expect(res.errors[0]).toMatch(/token Eduvia refusé/i);
    // Aucun fetch lourd derrière le status échoué
    expect(fetchAllPagesMock).not.toHaveBeenCalled();
  });

  it('catche AuthError et émet un message admin parlant', async () => {
    fetchStatusMock.mockRejectedValue(
      new AuthError(401, 'https://api.cfa.eduvia.app/api/v1/status'),
    );
    const supa = buildSupabase({ projets: projetsRule() });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      'client-X',
      'cfa.eduvia.app',
      'token-pourri',
    );

    expect(res.errors[0]).toMatch(/authentification|invalide|révoquée/i);
    expect(res.contrats).toBe(0);
  });

  it('si aucun projet actif → erreur claire sans appel API', async () => {
    const supa = buildSupabase({
      projets: { select: () => ({ data: [], error: null }) },
    });
    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      'client-X',
      'cfa.eduvia.app',
      'token',
    );
    expect(res.errors[0]).toMatch(/Aucun projet actif/i);
    expect(fetchStatusMock).not.toHaveBeenCalled();
  });
});

describe('syncEduviaForClient — upserts', () => {
  it('upsert apprenant avec source_client_id et onConflict eduvia_id,source_client_id', async () => {
    fetchAllPagesMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'employees') return [learnerFixture()];
        return [];
      },
    );
    const supa = buildSupabase({ projets: projetsRule() });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      'client-X',
      'cfa.eduvia.app',
      'token-A',
    );

    expect(res.apprenants).toBe(1);
    const upsertOp = supa.ops.find(
      (o) => o.op === 'upsert' && o.table === 'apprenants',
    );
    expect(upsertOp).toBeDefined();
    const payload = upsertOp!.payload as { source_client_id: string };
    expect(payload.source_client_id).toBe('client-X');
    expect(upsertOp!.options).toEqual({
      onConflict: 'eduvia_id,source_client_id',
    });
  });

  it('même apprenant resynchronisé → 1 seul upsert (pattern idempotent, pas d insert doublon)', async () => {
    // Si Eduvia renvoie 2 fois la même ligne (run 1 puis run 2), on doit avoir
    // 2 upserts mais sur le même eduvia_id+source_client_id - pas un insert
    // brut qui doublonnerait.
    fetchAllPagesMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'employees') return [learnerFixture({ id: 42 })];
        return [];
      },
    );
    const supa = buildSupabase({ projets: projetsRule() });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    await syncEduviaForClient(
      supa.client,
      'client-X',
      'cfa.eduvia.app',
      'token-A',
    );
    await syncEduviaForClient(
      supa.client,
      'client-X',
      'cfa.eduvia.app',
      'token-A',
    );

    const apprenantOps = supa.ops.filter(
      (o) => o.table === 'apprenants' && o.op !== 'select',
    );
    // Tous les ops sur apprenants sont des upsert (jamais d'insert)
    expect(apprenantOps.every((o) => o.op === 'upsert')).toBe(true);
    // 2 runs * 1 apprenant = 2 upserts
    expect(apprenantOps).toHaveLength(2);
  });

  it('propagation de l erreur supabase upsert apprenant → result.errors', async () => {
    fetchAllPagesMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'employees') return [learnerFixture({ id: 7 })];
        return [];
      },
    );
    const supa = buildSupabase({
      projets: projetsRule(),
      apprenants: {
        upsert: () => ({ error: { message: 'duplicate key' } }),
      },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      'client-X',
      'cfa.eduvia.app',
      'token-A',
    );

    expect(res.apprenants).toBe(0);
    expect(res.errors.some((e) => e.includes('eduvia_id=7'))).toBe(true);
    expect(res.errors[0]).toMatch(/duplicate/);
  });
});

describe('syncEduviaForClient — multi-tenant isolation', () => {
  it('client A et client B utilisent leurs propres clés et tagguent source_client_id distinct', async () => {
    // Eduvia retourne des learners différents selon la clé fournie.
    fetchAllPagesMock.mockImplementation(
      async (
        _instance: string,
        apiKey: string,
        resource: string,
      ): Promise<unknown[]> => {
        if (resource !== 'employees') return [];
        if (apiKey === 'key-A') return [learnerFixture({ id: 1 })];
        if (apiKey === 'key-B') return [learnerFixture({ id: 2 })];
        return [];
      },
    );

    const supaA = buildSupabase({
      projets: {
        select: () => ({
          data: [{ id: 'p-A', client_id: 'A', archive: false }],
          error: null,
        }),
      },
    });
    const supaB = buildSupabase({
      projets: {
        select: () => ({
          data: [{ id: 'p-B', client_id: 'B', archive: false }],
          error: null,
        }),
      },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    await syncEduviaForClient(supaA.client, 'A', 'a.eduvia.app', 'key-A');
    await syncEduviaForClient(supaB.client, 'B', 'b.eduvia.app', 'key-B');

    // fetchAllPages(employees) appelé avec key-A pour A, key-B pour B
    const employeesCalls = fetchAllPagesMock.mock.calls.filter(
      (c) => c[2] === 'employees',
    );
    expect(employeesCalls).toHaveLength(2);
    expect(employeesCalls[0]![1]).toBe('key-A');
    expect(employeesCalls[1]![1]).toBe('key-B');

    // Les apprenants A et B sont taggés avec leur source_client_id respectif
    const apprenantA = supaA.ops.find(
      (o) => o.op === 'upsert' && o.table === 'apprenants',
    );
    const apprenantB = supaB.ops.find(
      (o) => o.op === 'upsert' && o.table === 'apprenants',
    );
    expect(
      (apprenantA!.payload as { source_client_id: string }).source_client_id,
    ).toBe('A');
    expect(
      (apprenantB!.payload as { source_client_id: string }).source_client_id,
    ).toBe('B');
    // Pas de fuite : eduvia_id 1 jamais sur instance B
    expect((apprenantB!.payload as { eduvia_id: number }).eduvia_id).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// syncAllEduviaClients — orchestrateur multi-clés
// ---------------------------------------------------------------------------

describe('syncAllEduviaClients — orchestrateur', () => {
  it('skip une clé sans instance_url et continue avec les autres', async () => {
    const supa = buildSupabase({
      client_api_keys: {
        select: () => ({
          data: [
            {
              id: 'k1',
              client_id: 'A',
              api_key_encrypted: 'cipher-A',
              instance_url: null,
              label: 'A',
              is_active: true,
            },
            {
              id: 'k2',
              client_id: 'B',
              api_key_encrypted: 'cipher-B',
              instance_url: 'b.eduvia.app',
              label: 'B',
              is_active: true,
            },
          ],
          error: null,
        }),
      },
      projets: {
        select: () => ({
          data: [{ id: 'p-B', client_id: 'B', archive: false }],
          error: null,
        }),
      },
    });
    decryptApiKeyMock.mockImplementation((c: string) => `clear-${c}`);

    const { syncAllEduviaClients } = await import('@/lib/eduvia/sync');
    const res = await syncAllEduviaClients(supa.client);

    expect(res.totalClients).toBe(2);
    expect(res.skippedClients).toBe(1);
    expect(res.syncedClients).toBe(1);
    expect(res.errors.some((e) => e.includes('A') && /URL/i.test(e))).toBe(
      true,
    );
    // fetchStatus n'a été appelé que pour le client B (instance valide)
    expect(fetchStatusMock).toHaveBeenCalledTimes(1);
  });

  it('skip une clé non déchiffrable et continue', async () => {
    const supa = buildSupabase({
      client_api_keys: {
        select: () => ({
          data: [
            {
              id: 'k1',
              client_id: 'A',
              api_key_encrypted: 'broken-cipher',
              instance_url: 'a.eduvia.app',
              label: 'A',
              is_active: true,
            },
            {
              id: 'k2',
              client_id: 'B',
              api_key_encrypted: 'cipher-B',
              instance_url: 'b.eduvia.app',
              label: 'B',
              is_active: true,
            },
          ],
          error: null,
        }),
      },
      projets: {
        select: () => ({
          data: [{ id: 'p-B', client_id: 'B', archive: false }],
          error: null,
        }),
      },
    });

    decryptApiKeyMock.mockImplementation((cipher: string) => {
      if (cipher === 'broken-cipher') {
        throw new Error('ENCRYPTION_KEY missing');
      }
      return `clear-${cipher}`;
    });

    const { syncAllEduviaClients } = await import('@/lib/eduvia/sync');
    const res = await syncAllEduviaClients(supa.client);

    expect(res.totalClients).toBe(2);
    // Le client A a un résultat avec une erreur explicite (non déchiffrable)
    const aResult = res.results.find((r) => r.clientId === 'A');
    expect(aResult).toBeDefined();
    expect(aResult!.errors[0]).toMatch(/déchiffrable|non dechiffrable/i);
    // Le client B a quand même tourné
    expect(fetchStatusMock).toHaveBeenCalledTimes(1);
  });

  it('met à jour last_sync_at après une sync réussie', async () => {
    const supa = buildSupabase({
      client_api_keys: {
        select: () => ({
          data: [
            {
              id: 'k1',
              client_id: 'A',
              api_key_encrypted: 'cipher-A',
              instance_url: 'a.eduvia.app',
              label: 'A',
              is_active: true,
            },
          ],
          error: null,
        }),
      },
      projets: {
        select: () => ({
          data: [{ id: 'p-A', client_id: 'A', archive: false }],
          error: null,
        }),
      },
    });
    decryptApiKeyMock.mockReturnValue('clear-key');

    const { syncAllEduviaClients } = await import('@/lib/eduvia/sync');
    const res = await syncAllEduviaClients(supa.client);

    expect(res.syncedClients).toBe(1);
    const updateOp = supa.ops.find(
      (o) => o.table === 'client_api_keys' && o.op === 'update',
    );
    expect(updateOp).toBeDefined();
    const payload = updateOp!.payload as { last_sync_at: string };
    expect(payload.last_sync_at).toBeDefined();
    expect(updateOp!.filters.find((f) => f.col === 'id')?.val).toBe('k1');
  });

  it('aucune clé active → retour vide sans erreur', async () => {
    const supa = buildSupabase({
      client_api_keys: { select: () => ({ data: [], error: null }) },
    });
    const { syncAllEduviaClients } = await import('@/lib/eduvia/sync');
    const res = await syncAllEduviaClients(supa.client);
    expect(res.totalClients).toBe(0);
    expect(res.errors).toHaveLength(0);
  });

  it('erreur lecture client_api_keys → erreur globale, pas de crash', async () => {
    const supa = buildSupabase({
      client_api_keys: {
        select: () => ({ data: null, error: { message: 'rls denied' } }),
      },
    });
    const { syncAllEduviaClients } = await import('@/lib/eduvia/sync');
    const res = await syncAllEduviaClients(supa.client);
    expect(res.errors[0]).toMatch(/clés API|rls denied/i);
    expect(res.totalClients).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Limites documentées (tests skipped)
// ---------------------------------------------------------------------------

describe('syncEduviaForClient — orphan cleanup contrats', () => {
  it('archive le contrat present en DB mais absent de /contracts (fantome Eduvia)', async () => {
    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');

    // API renvoie un seul contrat (id=10). En DB on en a deux :
    // - id=10 (encore vivant cote Eduvia, sera upserté)
    // - id=99 (orphelin : disparu cote Eduvia → doit être archivé)
    fetchAllPagesMock.mockImplementation((_url, _key, resource: string) => {
      if (resource === 'contracts') {
        return Promise.resolve([
          {
            id: 10,
            employee_id: 1,
            company_id: 1,
            formation_id: 1,
            teacher_id: null,
            campus_id: 1,
            contract_number: 'C-10',
            internal_number: null,
            contract_type: 11,
            contract_mode: 23,
            contract_state: 'ENGAGE',
            contract_start_date: '2026-01-01',
            contract_end_date: '2027-01-01',
            contract_conclusion_date: null,
            practical_training_start_date: null,
            creation_mode: 'API',
            support: null,
            support_first_equipment: null,
            npec_amount: 1000,
            referrer_name: null,
            referrer_amount: null,
            referrer_type: 'NONE',
            accepted_at: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    // 2 selects sur 'contrats' surviennent dans cet ordre :
    //   1) existingContrats (filtre .in eduvia_id) → utilisé pour npec/rupture diff
    //   2) orphan lookup    (filtre archive=false + not eduvia_id is null)
    //   3) progressions     (filtre .in eduvia_id) → mapping uuid
    // On distingue par compteur d'appels select.
    let contratsSelectCall = 0;
    const { client, ops } = buildSupabase({
      projets: projetsRule(),
      contrats: {
        select: () => {
          contratsSelectCall++;
          if (contratsSelectCall === 2) {
            // orphan lookup : on a un contrat id=99 qui n'est pas dans l'API
            return {
              data: [
                {
                  id: 'uuid-orphan-99',
                  eduvia_id: 99,
                  ref: 'CTR-99',
                },
                // id=10 est aussi en DB mais il est dans la liste API → pas orphelin
                {
                  id: 'uuid-alive-10',
                  eduvia_id: 10,
                  ref: 'CTR-10',
                },
              ],
              error: null,
            };
          }
          return { data: [], error: null };
        },
        upsert: () => ({ error: null }),
        update: () => ({ error: null }),
      },
    });

    const res = await syncEduviaForClient(
      client,
      'client-X',
      'inst.eduvia.app',
      'key',
    );

    expect(res.contrats_archived_orphan).toBe(1);

    const updateOps = ops.filter(
      (o) => o.table === 'contrats' && o.op === 'update',
    );
    expect(updateOps).toHaveLength(1);
    const updated = updateOps[0]!;
    expect(updated.payload).toMatchObject({
      archive: true,
      deleted_in_eduvia_at: expect.any(String),
    });
    expect(updated.filters).toEqual([{ col: 'id', val: 'uuid-orphan-99' }]);
  });

  it('si /contracts renvoie 0 contrat, n archive rien (garde-fou anti-wipe)', async () => {
    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');

    // API rend 0 contrat (panne transitoire). DB a un contrat actif.
    fetchAllPagesMock.mockResolvedValue([]);

    const { client, ops } = buildSupabase({
      projets: projetsRule(),
      contrats: {
        select: () => ({
          data: [
            {
              id: 'uuid-existing',
              eduvia_id: 42,
              ref: 'CTR-42',
            },
          ],
          error: null,
        }),
        upsert: () => ({ error: null }),
        update: () => ({ error: null }),
      },
    });

    const res = await syncEduviaForClient(
      client,
      'client-X',
      'inst.eduvia.app',
      'key',
    );

    expect(res.contrats_archived_orphan).toBe(0);
    // Aucune update n'a été émise sur contrats (la garde anti-wipe a coupé court).
    const updateOps = ops.filter(
      (o) => o.table === 'contrats' && o.op === 'update',
    );
    expect(updateOps).toHaveLength(0);
  });
});

describe('syncEduviaForClient — limites connues', () => {
  it.skip('apprenant supprimé chez Eduvia → archive côté Soluvia (requires diff/tombstone refactor)', () => {
    // sync.ts ne diff pas la liste reçue avec ce qui existe en base ; il fait
    // seulement des upserts. Marquer un apprenant disparu comme archived
    // demanderait un soft-delete pass dédié (cf. spec 03 - section Eduvia
    // tombstone, encore non livrée). Skip volontaire.
  });
});

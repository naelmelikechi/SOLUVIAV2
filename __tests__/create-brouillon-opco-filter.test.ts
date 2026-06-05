// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour le filtre opcoCodesFilter dans createFactureFromEvents
 * (lib/actions/factures/brouillons.ts) + persistance opco_code sur lignes.
 *
 * Couverture :
 * 1. opcoCodesFilter = ['AKTO'] -> seul l'event AKTO est inclus
 * 2. opcoCodesFilter = []       -> Zod refuse avec "Au moins un OPCO"
 * 3. Pas de filtre              -> tous les events disponibles avec opco_code inclus
 * 4. Filtre code absent         -> erreur "Aucun event correspondant"
 * 5. Persistance                -> opco_code present dans l'insert facture_lignes
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

vi.mock('@/lib/auth/guards', () => ({
  requireAuth: vi.fn(),
  checkAuth: vi.fn(),
}));

vi.mock('@/lib/queries/billable-events', () => ({
  getBillableEvents: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/queries/societes-emettrices', () => ({
  getDefaultSocieteEmettriceId: vi.fn().mockResolvedValue('soc-default-id'),
}));

import { requireAuth, checkAuth } from '@/lib/auth/guards';
import { getBillableEvents } from '@/lib/queries/billable-events';

// ---------------------------------------------------------------------------
// IDs fixes en format UUID v4 valide
// ---------------------------------------------------------------------------
const PROJET_ID = 'a1b2c3d4-1234-4abc-89ef-000000000001';
const CONTRAT_AKTO_ID = 'a1b2c3d4-1234-4abc-89ef-000000000010';
const CONTRAT_OPCO2I_ID = 'a1b2c3d4-1234-4abc-89ef-000000000011';
const CLIENT_ID = 'a1b2c3d4-1234-4abc-89ef-000000000003';
const FACTURE_ID = 'a1b2c3d4-1234-4abc-89ef-000000000004';

const mockUser = {
  id: 'a1b2c3d4-1234-4abc-89ef-000000000099',
  email: 'admin@test.com',
};

// ---------------------------------------------------------------------------
// Helper : construit un BillableEvent minimal
// ---------------------------------------------------------------------------
function mockEvent(
  overrides: Partial<{
    type: 'engagement' | 'opco_step';
    source_id: string;
    contrat_id: string;
    contrat_ref: string;
    contract_number: string;
    internal_number: string | null;
    apprenant_nom: string;
    apprenant_prenom: string;
    formation_titre: string;
    contract_state: string;
    step_number: number | null;
    step_opening_date: string | null;
    step_paid_at: string | null;
    montant_brut: number;
    montant_commissionne: number;
    status: 'available' | 'billed' | 'locked';
    opco_code: string | null;
    opco_nom: string | null;
  }> = {},
) {
  return {
    type: 'engagement' as const,
    source_id: CONTRAT_AKTO_ID,
    contrat_id: CONTRAT_AKTO_ID,
    contrat_ref: 'CTR-00100',
    contract_number: '017202605001222',
    internal_number: null,
    apprenant_nom: 'Doe',
    apprenant_prenom: 'John',
    formation_titre: 'Test Formation',
    contract_state: 'ENGAGE',
    step_number: null,
    step_opening_date: null,
    step_paid_at: null,
    invoice_state: 'TRANSMIS' as string | null,
    montant_brut: 1000,
    montant_commissionne: 400,
    status: 'available' as const,
    opco_code: 'AKTO',
    opco_nom: 'AKTO - Commerce',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper : construit un mock supabase pour createFactureFromEvents.
// Sequence des appels :
//   1. projets               -> SELECT (.single)
//   2. eduvia_invoice_steps  -> audit SELECT (.then - Promise.all[0])
//   3. eduvia_invoice_lines  -> audit SELECT (.then - Promise.all[1])
//   4. factures              -> INSERT (.single)
//   5. facture_lignes        -> INSERT (.then)
//
// On capture les payloads des inserts pour pouvoir asserter dessus.
// ---------------------------------------------------------------------------
function buildSupabase() {
  const insertCalls: Array<{ table: string; payload: unknown }> = [];

  type TableResult = { data: unknown; error: unknown };
  const queues: Record<string, TableResult[]> = {
    projets: [
      {
        data: {
          id: PROJET_ID,
          client_id: CLIENT_ID,
          taux_commission: 40,
          client: { tva_intracommunautaire: false },
        },
        error: null,
      },
    ],
    eduvia_invoice_steps: [{ data: [], error: null }],
    eduvia_invoice_lines: [{ data: [], error: null }],
    factures: [{ data: { id: FACTURE_ID }, error: null }],
    facture_lignes: [{ data: null, error: null }],
  };
  const cursor: Record<string, number> = {};

  function next(table: string): TableResult {
    const q = queues[table];
    if (!q || q.length === 0) return { data: [], error: null };
    const idx = cursor[table] ?? 0;
    cursor[table] = idx + 1;
    return q[idx] ?? { data: [], error: null };
  }

  function makeChain(table: string) {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      not: () => chain,
      delete: () => chain,
      insert: (payload: unknown) => {
        insertCalls.push({ table, payload });
        if (table === 'factures') {
          // factures.insert().select().single()
          return {
            select: () => ({
              single: () => Promise.resolve(next('factures')),
            }),
          };
        }
        // facture_lignes.insert() -> awaitable directly
        return Promise.resolve(next('facture_lignes'));
      },
      single: () => {
        const r = next(table);
        return Promise.resolve(r);
      },
      then: (resolve: (v: unknown) => unknown) => {
        const r = next(table);
        return Promise.resolve(r).then(resolve);
      },
    };
    return chain;
  }

  const client = {
    from: (table: string) => makeChain(table),
  };

  return { client, insertCalls };
}

// ---------------------------------------------------------------------------
// Setup : mock requireAuth pour retourner le supabase mock
// ---------------------------------------------------------------------------
function setupRequireUser(supabaseMock: { from: (t: string) => unknown }) {
  const authResult = {
    ok: true,
    supabase: supabaseMock as never,
    user: mockUser,
  } as never;
  vi.mocked(requireAuth).mockResolvedValue(authResult);
  vi.mocked(checkAuth).mockResolvedValue(authResult);
}

// ---------------------------------------------------------------------------
// Setup : mock getBillableEvents avec les events donnés
// ---------------------------------------------------------------------------
function setupBillableEvents(events: ReturnType<typeof mockEvent>[]) {
  vi.mocked(getBillableEvents).mockResolvedValue({
    projetId: PROJET_ID,
    projetRef: '0007-HEO-APP',
    clientRaisonSociale: 'HEOL Formation',
    tauxCommission: 40,
    events,
    auditInvoiceIdsBySource: new Map(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createFactureFromEvents - filtre OPCO', () => {
  it('1. opcoCodesFilter = [AKTO] -> seul l event AKTO est inclus (OPCO2I exclu)', async () => {
    const eventAkto = mockEvent({
      source_id: CONTRAT_AKTO_ID,
      contrat_id: CONTRAT_AKTO_ID,
      opco_code: 'AKTO',
      montant_brut: 1000,
      montant_commissionne: 400,
    });
    const eventOpco2i = mockEvent({
      source_id: CONTRAT_OPCO2I_ID,
      contrat_id: CONTRAT_OPCO2I_ID,
      contrat_ref: 'CTR-00200',
      contract_number: '017202605001333',
      opco_code: 'OPCO2I',
      opco_nom: 'OPCO 2i',
      montant_brut: 2000,
      montant_commissionne: 800,
    });

    setupBillableEvents([eventAkto, eventOpco2i]);
    const { client, insertCalls } = buildSupabase();
    setupRequireUser(client);

    const { createFactureFromEvents } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFactureFromEvents({
      projetId: PROJET_ID,
      events: [
        { type: 'engagement', source_id: CONTRAT_AKTO_ID },
        { type: 'engagement', source_id: CONTRAT_OPCO2I_ID },
      ],
      opcoCodesFilter: ['AKTO'],
    });

    expect(result.success).toBe(true);

    // L'insert facture_lignes ne doit contenir que l'event AKTO
    const lignesInsert = insertCalls.find((c) => c.table === 'facture_lignes');
    expect(lignesInsert).toBeDefined();
    const lignes = lignesInsert!.payload as Array<{
      contrat_id: string;
      opco_code: string | null;
    }>;
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.contrat_id).toBe(CONTRAT_AKTO_ID);
    expect(lignes[0]!.opco_code).toBe('AKTO');
  });

  it('2. opcoCodesFilter = [] -> Zod refuse avec "Au moins un OPCO"', async () => {
    const { createFactureFromEvents } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFactureFromEvents({
      projetId: PROJET_ID,
      events: [{ type: 'engagement', source_id: CONTRAT_AKTO_ID }],
      opcoCodesFilter: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Au moins un OPCO/);
  });

  it('3. Pas de filtre -> tous les events disponibles inclus', async () => {
    const eventAkto = mockEvent({
      source_id: CONTRAT_AKTO_ID,
      contrat_id: CONTRAT_AKTO_ID,
      opco_code: 'AKTO',
      montant_brut: 1000,
      montant_commissionne: 400,
    });
    const eventOpco2i = mockEvent({
      source_id: CONTRAT_OPCO2I_ID,
      contrat_id: CONTRAT_OPCO2I_ID,
      contrat_ref: 'CTR-00200',
      contract_number: '017202605001333',
      opco_code: 'OPCO2I',
      opco_nom: 'OPCO 2i',
      montant_brut: 2000,
      montant_commissionne: 800,
    });

    setupBillableEvents([eventAkto, eventOpco2i]);
    const { client, insertCalls } = buildSupabase();
    setupRequireUser(client);

    const { createFactureFromEvents } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFactureFromEvents({
      projetId: PROJET_ID,
      events: [
        { type: 'engagement', source_id: CONTRAT_AKTO_ID },
        { type: 'engagement', source_id: CONTRAT_OPCO2I_ID },
      ],
      // pas d'opcoCodesFilter
    });

    expect(result.success).toBe(true);

    // Les deux events doivent etre dans l'insert
    const lignesInsert = insertCalls.find((c) => c.table === 'facture_lignes');
    expect(lignesInsert).toBeDefined();
    const lignes = lignesInsert!.payload as Array<{ contrat_id: string }>;
    expect(lignes).toHaveLength(2);
  });

  it('4. Filtre avec code absent dans les events -> erreur "Aucun event correspondant"', async () => {
    const eventAkto = mockEvent({
      source_id: CONTRAT_AKTO_ID,
      contrat_id: CONTRAT_AKTO_ID,
      opco_code: 'AKTO',
      montant_brut: 1000,
      montant_commissionne: 400,
    });

    setupBillableEvents([eventAkto]);
    const { client } = buildSupabase();
    setupRequireUser(client);

    const { createFactureFromEvents } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFactureFromEvents({
      projetId: PROJET_ID,
      events: [{ type: 'engagement', source_id: CONTRAT_AKTO_ID }],
      opcoCodesFilter: ['ATLAS'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Aucun event correspondant/);
    expect(result.error).toMatch(/ATLAS/);
  });

  it('5. Persistance : opco_code est present dans l insert facture_lignes', async () => {
    const eventAkto = mockEvent({
      source_id: CONTRAT_AKTO_ID,
      contrat_id: CONTRAT_AKTO_ID,
      opco_code: 'AKTO',
      opco_nom: 'AKTO - Commerce et Services',
      montant_brut: 1500,
      montant_commissionne: 600,
    });

    setupBillableEvents([eventAkto]);
    const { client, insertCalls } = buildSupabase();
    setupRequireUser(client);

    const { createFactureFromEvents } =
      await import('@/lib/actions/factures/brouillons');
    const result = await createFactureFromEvents({
      projetId: PROJET_ID,
      events: [{ type: 'engagement', source_id: CONTRAT_AKTO_ID }],
    });

    expect(result.success).toBe(true);

    const lignesInsert = insertCalls.find((c) => c.table === 'facture_lignes');
    expect(lignesInsert).toBeDefined();
    const lignes = lignesInsert!.payload as Array<{
      facture_id: string;
      contrat_id: string;
      opco_code: string | null;
      event_type: string;
      event_source_id: string;
    }>;
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.opco_code).toBe('AKTO');
    expect(lignes[0]!.facture_id).toBe(FACTURE_ID);
    expect(lignes[0]!.event_type).toBe('engagement');
    expect(lignes[0]!.event_source_id).toBe(CONTRAT_AKTO_ID);
  });
});
